/**
 * Tests for skill-gate.mjs — the PreToolUse hook gating the stage skills in the
 * fast SDD profile.
 * Run: node --test hooks/lib/skill-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "skill-gate.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project dir; files are created by path ("/"-separated keys). */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "skill-gate-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

/** As kb-gate.test.mjs: env CLAUDE_PROJECT_DIR points at the temp dir; `opts.raw`
 *  sends the payload verbatim (garbage-stdin cases), `opts.noEnv` removes
 *  CLAUDE_PROJECT_DIR so the outer environment cannot leak in. */
function runHook(payload, cwd, opts = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: cwd };
  if (opts.noEnv) delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [HOOK], {
    input: opts.raw ? payload : JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env,
  });
}

test("hook: no .spec-gate (soft) — brainstorm is allowed, silence", () => {
  const dir = project({});
  const r = runHook({ tool_name: "Skill", tool_input: { skill: "brainstorm" }, cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: fast — the three stage skills are blocked with instructions", () => {
  for (const skill of ["brainstorm", "system-thinking", "decompositor"]) {
    const dir = project({ ".spec-gate": "fast\n" });
    const r = runHook({ tool_name: "Skill", tool_input: { skill }, cwd: dir }, dir);
    assert.equal(r.status, 2, skill);
    assert.match(r.stderr, /skill-gate/, skill);
    assert.match(r.stderr, /fast/, skill);
    assert.match(r.stderr, new RegExp(skill), skill);
  }
});

test("hook: fast — spec-implementation is allowed", () => {
  const dir = project({ ".spec-gate": "fast\n" });
  const r = runHook(
    { tool_name: "Skill", tool_input: { skill: "spec-implementation" }, cwd: dir },
    dir,
  );
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: fast — the name is normalized: a leading slash and a plugin prefix are blocked too", () => {
  const dir = project({ ".spec-gate": "fast\n" });
  const slash = runHook({ tool_name: "Skill", tool_input: { skill: "/brainstorm" }, cwd: dir }, dir);
  assert.equal(slash.status, 2);
  assert.match(slash.stderr, /"brainstorm"/);
  const prefixed = runHook(
    { tool_name: "Skill", tool_input: { skill: "specialist:brainstorm" }, cwd: dir },
    dir,
  );
  assert.equal(prefixed.status, 2);
  assert.match(prefixed.stderr, /"brainstorm"/);
});

test("hook: fast — an unknown skill is allowed", () => {
  const dir = project({ ".spec-gate": "fast\n" });
  const r = runHook({ tool_name: "Skill", tool_input: { skill: "lazy" }, cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: garbage on stdin — silence", () => {
  const dir = project({ ".spec-gate": "fast\n" });
  const r = runHook("this is not json {{{", dir, { raw: true });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: not Skill (Edit) — silence", () => {
  const dir = project({ ".spec-gate": "fast\n" });
  const r = runHook(
    { tool_name: "Edit", tool_input: { file_path: "src/x.ts" }, cwd: dir },
    dir,
  );
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: env without CLAUDE_PROJECT_DIR — payload.cwd points at the fast project and works", () => {
  const dir = project({ ".spec-gate": "fast\n" });
  const r = runHook({ tool_name: "Skill", tool_input: { skill: "brainstorm" }, cwd: dir }, dir, {
    noEnv: true,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /skill-gate/);
});

test("hook: role qa — brainstorm is blocked with the dispatch protocol", () => {
  const dir = project({ ".spec-gate": "role: qa\n" });
  const r = runHook({ tool_name: "Skill", tool_input: { skill: "brainstorm" }, cwd: dir }, dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /belongs to the analyst role/);
  assert.match(r.stderr, /role: qa/);
  assert.match(r.stderr, /dispatch options/);
});

test("hook: role qa — its own skills, dispatch and the role-* entries pass", () => {
  const dir = project({ ".spec-gate": "role: qa\n" });
  for (const skill of ["bug-hunt", "spec-review", "dispatch", "role-dev"]) {
    const r = runHook({ tool_name: "Skill", tool_input: { skill }, cwd: dir }, dir);
    assert.equal(r.status, 0, skill);
    assert.equal(r.stderr, "", skill);
  }
});

test("hook: role with mode — both profiles read from one file", () => {
  const dir = project({ ".spec-gate": "mode: fast\nrole: dev\n" });
  const stage = runHook({ tool_name: "Skill", tool_input: { skill: "brainstorm" }, cwd: dir }, dir);
  assert.equal(stage.status, 2);
  assert.match(stage.stderr, /fast` SDD profile/);
  const outOfRole = runHook({ tool_name: "Skill", tool_input: { skill: "code-review" }, cwd: dir }, dir);
  assert.equal(outOfRole.status, 2);
  assert.match(outOfRole.stderr, /belongs to the qa role/);
  const inRole = runHook({ tool_name: "Skill", tool_input: { skill: "lazy" }, cwd: dir }, dir);
  assert.equal(inRole.status, 0);
});
