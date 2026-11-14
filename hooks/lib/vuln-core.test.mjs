/**
 * Tests for vuln-core.mjs — semgrep probe, config resolution, JSON parsing,
 * commit-boundary decision. Run: node --test hooks/lib/vuln-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkGitCommit,
  parseSemgrepJson,
  readVulnMode,
  registryPacks,
  resolveConfig,
  scanSingleFile,
} from "./vuln-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vuln-core-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const FINDING = {
  results: [
    {
      check_id: "python.sqlalchemy.sql-injection",
      path: "src/app.py",
      start: { line: 10 },
      extra: { message: "Possible SQL injection vector through string-based query construction." },
    },
  ],
  errors: [],
};

/** Fake run(): probes --version, serves staged lists for git diff, scan results for semgrep. */
function fakeRun({ staged = [], json = "", semgrep = true, exitCode = 0 } = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, args]);
    if (args.includes("--version")) {
      return semgrep ? { code: 0, stdout: "1.100.0", stderr: "" } : { code: 1, stdout: "", stderr: "" };
    }
    if (args[0] === "diff") return { code: 0, stdout: staged.join("\n") + "\n", stderr: "" };
    if (args.includes("scan")) return { code: exitCode, stdout: json, stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

test("readVulnMode: commit by default, always/edit and off, garbage — commit", () => {
  assert.equal(readVulnMode(project({})), "commit");
  assert.equal(readVulnMode(project({ ".vuln-guard": "always\n" })), "always");
  assert.equal(readVulnMode(project({ ".vuln-guard": "edit" })), "always");
  assert.equal(readVulnMode(project({ ".vuln-guard": "OFF" })), "off");
  assert.equal(readVulnMode(project({ ".vuln-guard": "sometimes" })), "commit");
});

test("resolveConfig: the project's semgrep.yml and .semgrep.yml beat the registry, without them — null", () => {
  const a = project({ "semgrep.yml": "rules: []\n" });
  assert.ok(resolveConfig(a).endsWith("semgrep.yml"));
  const b = project({ ".semgrep.yml": "rules: []\n" });
  assert.ok(resolveConfig(b).endsWith(".semgrep.yml"));
  assert.equal(resolveConfig(project({})), null);
});

test("registryPacks: security-audit always + one pack per language (order does not matter)", () => {
  assert.deepEqual(registryPacks(["src/a.py", "b.ts", "c.kt", "d.js"]).sort(), [
    "p/javascript",
    "p/kotlin",
    "p/python",
    "p/security-audit",
    "p/typescript",
  ]);
  assert.deepEqual(registryPacks(["README.md", "docs/x.yml"]), ["p/security-audit"]);
});

test("parseSemgrepJson: results are mapped, garbage — an empty list", () => {
  const f = parseSemgrepJson(JSON.stringify(FINDING));
  assert.deepEqual(f, [
    {
      rule: "python.sqlalchemy.sql-injection",
      file: "src/app.py",
      line: 10,
      message: "Possible SQL injection vector through string-based query construction.",
    },
  ]);
  assert.deepEqual(parseSemgrepJson("not json"), []);
  assert.deepEqual(parseSemgrepJson('{"errors":["boom"]}'), []);
});

test("checkGitCommit: a semgrep finding blocks the commit with rule, location and escapes", async () => {
  const dir = project({});
  const { run, calls } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING) });
  const r = await checkGitCommit({ projectDir: dir, command: "git commit -m 'x'", run });
  assert.ok(r && r.reason.includes("python.sqlalchemy.sql-injection"));
  assert.ok(r.reason.includes("src/app.py:10"));
  assert.ok(r.reason.includes("# nosemgrep:"));
  assert.ok(r.reason.includes(".vuln-allow"));
  const scan = calls.find((c) => c[1].includes("scan"))[1];
  assert.ok(scan.includes("p/security-audit") && scan.includes("p/python"));
  assert.ok(scan.includes("src/app.py"));
});

test("checkGitCommit: .vuln-allow suppresses a finding by rule-id and by path", async () => {
  const byRule = project({ ".vuln-allow": "# FP\nsql-injection\n" });
  const { run } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING) });
  assert.equal(await checkGitCommit({ projectDir: byRule, command: "git commit -m x", run }), null);

  const byPath = project({ ".vuln-allow": "^src/app\\.py$\n" });
  const { run: run2 } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING) });
  assert.equal(await checkGitCommit({ projectDir: byPath, command: "git commit -m x", run: run2 }), null);
});

test("checkGitCommit: a local semgrep.yml replaces the registry; no commit / no semgrep / broken scanner — null", async () => {
  const local = project({ "semgrep.yml": "rules: []\n" });
  const { run, calls } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING) });
  const r = await checkGitCommit({ projectDir: local, command: "git commit -m x", run });
  const scan = calls.find((c) => c[1].includes("scan"))[1];
  assert.ok(scan.some((a) => String(a).endsWith("semgrep.yml")) && !scan.includes("p/python"));
  assert.ok(r); // the config is empty, semgrep returned a finding — that is what blocks

  const none = fakeRun({ staged: [] });
  assert.equal(await checkGitCommit({ projectDir: project({}), command: "git commit -m x", run: none.run }), null);

  const missing = fakeRun({ semgrep: false, staged: ["a.py"] });
  assert.equal(await checkGitCommit({ projectDir: project({}), command: "git commit -m x", run: missing.run }), null);
  assert.ok(!missing.calls.some((c) => c[1].includes("scan")), "no scan runs without semgrep");

  const broken = fakeRun({ staged: ["a.py"], json: JSON.stringify(FINDING), exitCode: 2 });
  assert.equal(await checkGitCommit({ projectDir: project({}), command: "git commit -m x", run: broken.run }), null);
});

test("regression: .vuln-guard=off disables the commit scan too (documented as \"off\")", async () => {
  const off = project({ ".vuln-guard": "off\n" });
  const { run, calls } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING) });
  assert.equal(await checkGitCommit({ projectDir: off, command: "git commit -m x", run }), null);
  assert.ok(!calls.some((c) => c[1].includes("scan")), "off must not run semgrep at all");

  // commit / always still scan
  for (const mode of ["commit", "always"]) {
    const dir = project({ ".vuln-guard": mode });
    const { run: r2 } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING) });
    assert.ok(await checkGitCommit({ projectDir: dir, command: "git commit -m x", run: r2 }), mode);
  }
});

test("checkGitCommit: findings at exit 0 — semgrep's default without --error — block too", async () => {
  const { run } = fakeRun({ staged: ["src/app.py"], json: JSON.stringify(FINDING), exitCode: 0 });
  const r = await checkGitCommit({ projectDir: project({}), command: "git commit -m x", run });
  assert.ok(r && r.reason.includes("python.sqlalchemy.sql-injection"));
});

test("checkGitCommit: -a/-am scans the HEAD delta; non-commit commands are ignored", async () => {
  const { run, calls } = fakeRun({ staged: ["a.py"], json: "" });
  await checkGitCommit({ projectDir: project({}), command: "git commit -am 'x'", run });
  const diff = calls.find((c) => c[0] === "git")[1];
  assert.ok(diff.includes("HEAD"));

  const { run: run2 } = fakeRun({});
  assert.equal(await checkGitCommit({ projectDir: project({}), command: "git push && git status", run: run2 }), null);
});

test("scanSingleFile: a finding in an edit — block; a file outside the project — null", async () => {
  const dir = project({});
  const { run } = fakeRun({ json: JSON.stringify(FINDING) });
  const r = await scanSingleFile({ projectDir: dir, filePath: join(dir, "src", "app.py"), run });
  assert.ok(r && r.reason.includes("src/app.py:10"));

  const { run: run2 } = fakeRun({ json: JSON.stringify(FINDING) });
  assert.equal(
    await scanSingleFile({ projectDir: dir, filePath: join(dir, "..", "elsewhere", "app.py"), run: run2 }),
    null,
  );
});
