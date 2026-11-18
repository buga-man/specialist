/**
 * Tests for kb-fs.mjs — the file and git layer of the kb-index skill.
 * Run: node --test skills/kb-index/scripts/lib/kb-fs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listMarkdownFiles, readDoc, computeHash, readConfig, readIndex, writeIndex, writeMaps } from "./kb-fs.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project dir; files are created by path ("/"-separated keys). */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kb-fs-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("file list: without git — a filesystem walk, service directories are skipped", () => {
  const dir = project({
    "a.md": "# a",
    "docs/b.md": "# b",
    "node_modules/c.md": "# c",
    ".kbindex/d.md": "# d",
    "notes.txt": "text",
  });
  assert.deepEqual(listMarkdownFiles(dir), ["a.md", "docs/b.md"]);
});

test("file list: non-ASCII and spaces in names", () => {
  const dir = project({ "docs/Café notes 2026.md": "# x", "r&d/a.md": "# y" });
  assert.deepEqual(listMarkdownFiles(dir), ["docs/Café notes 2026.md", "r&d/a.md"]);
});

test("file list: the git branch preserves non-ASCII and spaces", () => {
  const dir = project({ "docs/Café notes 2026.md": "# x", "r&d/a.md": "# y", "skip.txt": "t" });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  assert.deepEqual(listMarkdownFiles(dir), ["docs/Café notes 2026.md", "r&d/a.md"]);
});

test("hash: same content — same hash, different content — different hash", () => {
  assert.equal(computeHash("text"), computeHash("text"));
  assert.notEqual(computeHash("text"), computeHash("text2"));
  assert.match(computeHash("x"), /^[0-9a-f]{40}$/);
});

test("doc read: a missing file — an empty string", () => {
  const dir = project({ "a.md": "# a" });
  assert.equal(readDoc(dir, "a.md"), "# a");
  assert.equal(readDoc(dir, "missing.md"), "");
});

test("index: a write/read round-trip, missing — null", () => {
  const dir = project({ "a.md": "# a" });
  assert.equal(readIndex(dir), null);
  writeIndex(dir, [{ path: "a.md", id: "X" }]);
  assert.deepEqual(readIndex(dir), [{ path: "a.md", id: "X" }]);
});

test("maps: written following the path mirror, the root goes to maps/INDEX.md", () => {
  const dir = project({ "a.md": "# a" });
  const maps = new Map([["", "# .\n"], ["docs/req", "# docs/req\n"]]);
  writeMaps(dir, maps);
  assert.equal(readDoc(dir, ".kbindex/maps/INDEX.md"), "# .\n");
  assert.equal(readDoc(dir, ".kbindex/maps/docs/req/INDEX.md"), "# docs/req\n");
});

test("config: .kbindex.json is read, without it — the defaults", () => {
  const dir = project();
  assert.deepEqual(readConfig(dir), { roots: [], include: [], exclude: [], gistMaxChars: 120, bodySearch: true });
  writeFileSync(
    join(dir, ".kbindex.json"),
    JSON.stringify({ roots: ["docs"], exclude: ["**/source-briefs/**"], gistMaxChars: 80 }),
  );
  const config = readConfig(dir);
  assert.deepEqual(config.roots, ["docs"]);
  assert.deepEqual(config.exclude, ["**/source-briefs/**"]);
  assert.equal(config.gistMaxChars, 80);
  assert.equal(config.bodySearch, true);
});

test("index: the directory ignores itself", () => {
  const dir = project({ "a.md": "# a" });
  writeIndex(dir, [{ path: "a.md", id: "X" }]);
  assert.equal(readDoc(dir, ".kbindex/.gitignore").trim(), "*");
});
