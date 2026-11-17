/**
 * Tests for suite-core.mjs — the .suite-gate config, the commit-boundary decision, the
 * exit-code mapping. Run: node --test hooks/lib/suite-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkGitCommit, readSuiteGateCommand, TEST_TIMEOUT_MS } from "./suite-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "suite-core-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

/** Fake run(): answers the staged-state git diffs; everything else — a quiet ok. */
function fakeRun({ staged = true, gitCodes = {} } = {}) {
  const calls = [];
  const run = async (cmd, args, opts) => {
    calls.push([cmd, args, opts]);
    const key = args.includes("--quiet") ? (args.includes("HEAD") ? "head" : "cached") : "other";
    return { code: gitCodes[key] ?? (key === "other" ? 0 : staged ? 1 : 0), stdout: "", stderr: "" };
  };
  return { run, calls };
}

/** Fake runShell(): remembers the call, returns the scripted exit code and output. */
function fakeRunShell({ code = 0, stdout = "", stderr = "" } = {}) {
  const calls = [];
  const runShell = async (cmdline, opts) => {
    calls.push([cmdline, opts]);
    return { code, stdout, stderr };
  };
  return { runShell, calls };
}

test("readSuiteGateCommand: no file / empty / off — null; a line — the command; notes after it are dropped", () => {
  assert.equal(readSuiteGateCommand(project({})), null);
  assert.equal(readSuiteGateCommand(project({ ".suite-gate": "   \n" })), null);
  assert.equal(readSuiteGateCommand(project({ ".suite-gate": "OFF\n" })), null);
  assert.equal(readSuiteGateCommand(project({ ".suite-gate": "npm test\n" })), "npm test");
  assert.equal(
    readSuiteGateCommand(project({ ".suite-gate": "mix test\n# runs on the docker stand\n" })),
    "mix test",
  );
});

test("checkGitCommit: no .suite-gate — the suite never runs (opt-in)", async () => {
  const { run } = fakeRun();
  const { runShell, calls } = fakeRunShell({ code: 1 });
  assert.equal(await checkGitCommit({ projectDir: project({}), command: "git commit -m x", run, runShell }), null);
  assert.equal(calls.length, 0, "no .suite-gate — no test command spawn");
});

test("checkGitCommit: green suite — null; red suite — block with the tail of the output and the escape", async () => {
  const dir = project({ ".suite-gate": "npm test" });
  const green = fakeRunShell({ code: 0 });
  assert.equal(
    await checkGitCommit({ projectDir: dir, command: "git commit -m x", run: fakeRun().run, runShell: green.runShell }),
    null,
  );
  assert.deepEqual(green.calls, [["npm test", { cwd: dir, timeout: TEST_TIMEOUT_MS }]]);

  const red = fakeRunShell({ code: 1, stdout: "ok 5 passing\n", stderr: "not ok 6 kb-index rebuilds\n" });
  const r = await checkGitCommit({ projectDir: dir, command: "git commit -m x", run: fakeRun().run, runShell: red.runShell });
  assert.ok(r && r.reason.includes("exit 1"));
  assert.ok(r.reason.includes("npm test"));
  assert.ok(r.reason.includes("not ok 6"), "the tail of the output reaches the agent");
  assert.ok(r.reason.includes(".suite-gate"), "the escape names the gate file");
});

test("checkGitCommit: a long output is clipped to its tail, not its head", async () => {
  const dir = project({ ".suite-gate": "npm test" });
  const head = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
  const { runShell } = fakeRunShell({ code: 1, stdout: `${head}\nAssertionError: expected 3 to equal 4\n` });
  const r = await checkGitCommit({ projectDir: dir, command: "git commit -m x", run: fakeRun().run, runShell });
  assert.ok(!r.reason.includes("line 0\n") && !r.reason.includes("line 10\n"), "the head of a long output is dropped");
  assert.ok(r.reason.includes("AssertionError"), "the failure line at the end survives");
  assert.ok(r.reason.includes("…[truncated]"));
});

test("checkGitCommit: spawn error / timeout (status null) — uncertainty does not block", async () => {
  const dir = project({ ".suite-gate": "npm test" });
  for (const code of [null, undefined]) {
    const { runShell } = fakeRunShell({ code });
    assert.equal(
      await checkGitCommit({ projectDir: dir, command: "git commit -m x", run: fakeRun().run, runShell }),
      null,
      `status ${code} — fail-safe`,
    );
  }
});

test("checkGitCommit: nothing staged — the suite is skipped; git -C <dir> runs the suite there", async () => {
  const dir = project({ ".suite-gate": "npm test" });
  const empty = fakeRun({ staged: false });
  const quiet = fakeRunShell({ code: 1 });
  assert.equal(await checkGitCommit({ projectDir: dir, command: "git commit -m x", run: empty.run, runShell: quiet.runShell }), null);
  assert.equal(quiet.calls.length, 0, "an empty index must not run the suite");

  const elsewhere = fakeRun();
  const shell = fakeRunShell({ code: 0 });
  await checkGitCommit({ projectDir: dir, command: "git -C /elsewhere/repo commit -m x", run: elsewhere.run, runShell: shell.runShell });
  assert.ok(elsewhere.calls.every(([, , opts]) => opts.cwd === "/elsewhere/repo"), "git runs in the -C target");
  assert.deepEqual(shell.calls, [["npm test", { cwd: "/elsewhere/repo", timeout: TEST_TIMEOUT_MS }]]);
});

test("checkGitCommit: non-commit commands are ignored; compound lines and -am are caught", async () => {
  const dir = project({ ".suite-gate": "npm test" });
  const { run } = fakeRun();
  const idle = fakeRunShell({ code: 1 });
  for (const command of ["git push", "git status && npm run build", "echo git commit"]) {
    assert.equal(await checkGitCommit({ projectDir: dir, command, run, runShell: idle.runShell }), null, command);
  }
  assert.equal(idle.calls.length, 0, "no commit — no suite");

  // `git add . && git commit -m x` — the commit segment triggers the gate
  const { runShell } = fakeRunShell({ code: 1 });
  assert.ok(await checkGitCommit({ projectDir: dir, command: "git add . && git commit -m x", run, runShell }));

  // -am stages the tracked delta — the HEAD diff decides staged state
  const amRun = fakeRun();
  const amShell = fakeRunShell({ code: 1 });
  assert.ok(await checkGitCommit({ projectDir: dir, command: "git commit -am x", run: amRun.run, runShell: amShell.runShell }));
  assert.ok(amRun.calls.some(([, args]) => args.includes("HEAD") && args.includes("--quiet")), "-am checks the HEAD delta");
});

test("checkGitCommit: a green suite in an earlier segment settles the whole line", async () => {
  const dir = project({ ".suite-gate": "npm test" });
  const { run } = fakeRun();
  const { runShell, calls } = fakeRunShell({ code: 0 });
  assert.equal(
    await checkGitCommit({ projectDir: dir, command: "git commit -m a && git commit -m b", run, runShell }),
    null,
  );
  assert.equal(calls.length, 1, "the identical suite is not run twice for one command line");
});
