/**
 * Tests for hook-kit.mjs — the shared adapter kit. readHookPayload reads stdin, so it
 * is exercised in child processes; the rest runs in-process.
 * Run: node --test hooks/lib/hook-kit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexContext, resolveProjectDir, run } from "./hook-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Reads stdin through the kit in a child process — readFileSync(0) needs a real pipe. */
function payloadOf(stdinText) {
  const script = `import("./hook-kit.mjs").then((m) => process.stdout.write(JSON.stringify(m.readHookPayload())))`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: HERE,
    input: stdinText,
    encoding: "utf8",
  });
  return { out: r.stdout, code: r.status };
}

test("readHookPayload: valid JSON parses; garbage and empty stdin read as {}", () => {
  assert.deepEqual(JSON.parse(payloadOf('{"tool_name":"Bash"}').out), { tool_name: "Bash" });
  assert.deepEqual(JSON.parse(payloadOf("not json").out), {});
  assert.deepEqual(JSON.parse(payloadOf("").out), {});
  assert.equal(payloadOf("x").code, 0); // fail-safe: garbage stdin is not a crash
});

test("run: the { code, stdout, stderr } contract every core expects", () => {
  const ok = run("node", ["-e", "process.stdout.write('out'); process.stderr.write('err')"]);
  assert.deepEqual(ok, { code: 0, stdout: "out", stderr: "err" });
  const failed = run("node", ["-e", "process.exit(3)"]);
  assert.equal(failed.code, 3);
});

test("resolveProjectDir: CLAUDE_PROJECT_DIR wins, then the git root, then cwd", () => {
  const repo = mkdtempSync(join(tmpdir(), "hook-kit-"));
  dirs.push(repo);
  const nested = join(repo, "sub");
  mkdirSync(nested, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });

  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = "/host/said/so";
    assert.equal(resolveProjectDir({ cwd: nested }), "/host/said/so");
    delete process.env.CLAUDE_PROJECT_DIR;
    // The git root, not the subdirectory (realpath: git resolves macOS /var → /private/var;
    // realpath on both sides: the git flavor decides the slashes — MSYS emits "C:/…",
    // realpathSync(repo) is native "C:\…").
    assert.equal(realpathSync(resolveProjectDir({ cwd: nested })), realpathSync(repo));
    assert.equal(realpathSync(resolveProjectDir({})), realpathSync(process.cwd()));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }
});

test("codexContext: the additionalContext envelope Codex reads", () => {
  const envelope = JSON.parse(codexContext("PostToolUse", "hello"));
  assert.deepEqual(envelope, {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "hello" },
  });
});
