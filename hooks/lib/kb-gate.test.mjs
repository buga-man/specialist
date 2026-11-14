/**
 * Tests for kb-gate.mjs — the Stop hook that keeps the index in sync with the disk.
 * Run: node --test hooks/lib/kb-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "kb-gate.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project dir; files are created by path ("/"-separated keys). */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kb-gate-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

/** The index file in the shape the skill writes it. */
function indexFile(records) {
  return JSON.stringify({ schema: 1, records });
}

function runHook(payload, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
}

test("hook: not Stop — silence", () => {
  const dir = project();
  const r = runHook({ hook_event_name: "PreToolUse", cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: no index — silence, the project is untouched", () => {
  const dir = project({ "a.md": "# a" });
  const r = runHook({ hook_event_name: "Stop", cwd: dir, stop_hook_active: false }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: stop_hook_active — does not block", () => {
  const dir = project({ "a.md": "# a", ".kbindex/index.json": indexFile([{ path: "a.md", hash: "x" }]) });
  const r = runHook({ hook_event_name: "Stop", cwd: dir, stop_hook_active: true }, dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /already continuing/);
});

test("hook: index diverged from the disk — block with instructions", () => {
  const dir = project({ "a.md": "# a", ".kbindex/index.json": indexFile([{ path: "a.md", hash: "stale" }]) });
  const r = runHook({ hook_event_name: "Stop", cwd: dir, stop_hook_active: false }, dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /documentation index is stale/);
  assert.match(r.stderr, /kb\.mjs" build/);
  assert.match(r.stderr, /--project/);
});

test("hook: the index matches the disk — silence", () => {
  const hash = createHash("sha1").update("# a").digest("hex");
  const dir = project({ "a.md": "# a", ".kbindex/index.json": indexFile([{ path: "a.md", hash }]) });
  const r = runHook({ hook_event_name: "Stop", cwd: dir, stop_hook_active: false }, dir);
  assert.equal(r.status, 0);
});
