/**
 * Tests for edit-guard.mjs / edit-guard-codex.mjs — the merged post-edit hook:
 * boundary-visibility notes, formatter, linter, opt-in semgrep, in one process and one
 * order. The formatter/linter paths need project tooling, so these adapter tests cover
 * the parts that run without any: the notes and the silence.
 * Run: node --test hooks/lib/edit-guard.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, "edit-guard.mjs");
const GUARD_CODEX = join(HERE, "edit-guard-codex.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "edit-guard-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function runHook(script, payload, cwd) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
}

test("edit-guard: an edit to a plan's - Files: line — the scope note reaches the agent", () => {
  const dir = project({ "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n" });
  const r = runHook(GUARD, {
    tool_name: "Edit",
    tool_input: {
      file_path: join(dir, "docs/plans/p.md"),
      old_string: "- Files: `src/a.ts`",
      new_string: "- Files: `src/a.ts`, `src/b.ts`",
    },
    cwd: dir,
  }, dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /- Files:/);
  assert.match(r.stderr, /docs\/plans/);
});

test("edit-guard: an allowlist edit — the boundary note; a plain code edit — silence", () => {
  const dir = project({});
  const allow = runHook(GUARD, {
    tool_name: "Edit",
    tool_input: { file_path: join(dir, ".secrets-allow"), old_string: "# x", new_string: "fixture-key" },
    cwd: dir,
  }, dir);
  assert.equal(allow.status, 2);
  assert.match(allow.stderr, /\.secrets-allow/);

  const code = runHook(GUARD, {
    tool_name: "Edit",
    tool_input: { file_path: join(dir, "src/a.ts"), old_string: "a", new_string: "b" },
    cwd: dir,
  }, dir);
  assert.equal(code.status, 0); // no project formatter/linter declared, vuln mode commit — nothing to say
  assert.equal(code.stderr, "");
});

test("edit-guard: a non-edit tool and a plan edit that touches no scope line — silence", () => {
  const dir = project({ "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n- Do:\n  1. step\n" });
  const bash = runHook(GUARD, { tool_name: "Bash", tool_input: { command: "ls" }, cwd: dir }, dir);
  assert.equal(bash.status, 0);
  const prose = runHook(GUARD, {
    tool_name: "Edit",
    tool_input: { file_path: join(dir, "docs/plans/p.md"), old_string: "1. step", new_string: "1. step done" },
    cwd: dir,
  }, dir);
  assert.equal(prose.status, 0);
});

test("edit-guard-codex: a patch widening a plan's scope — one additionalContext JSON line, exit 0", () => {
  const dir = project({ "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n" });
  const patch = "*** Begin Patch\n*** Update File: docs/plans/p.md\n@@\n-- Files: `src/a.ts`\n+- Files: `src/a.ts`, `src/b.ts`\n*** End Patch";
  const r = runHook(GUARD_CODEX, { tool_name: "apply_patch", tool_input: { input: patch }, cwd: dir }, dir);
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, "exactly one JSON envelope");
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(parsed.hookSpecificOutput.additionalContext, /- Files:/);
});

test("edit-guard-codex: a plain patch — silence on stdout", () => {
  const dir = project({});
  const patch = "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n*** End Patch";
  const r = runHook(GUARD_CODEX, { tool_name: "apply_patch", tool_input: { input: patch }, cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});
