/**
 * Tests for git-watch.mjs — the PostToolUse Bash hook over a real git repository
 * in a temp dir.
 * Run: node --test feature-mastering/hooks/lib/git-watch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { computeHash } from "../../skills/kb-index/scripts/lib/kb-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "git-watch.mjs");
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const GIT = ["-c", "user.email=t@t", "-c", "user.name=t"];
const TODAY = new Date().toISOString().slice(0, 10);

/** A temp git repo: one commit (start.txt + doc.md), returns { dir, base }. */
function gitProject() {
  const dir = mkdtempSync(join(tmpdir(), "git-watch-"));
  dirs.push(dir);
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  run(["init"]);
  writeFileSync(join(dir, "start.txt"), "start\n");
  writeFileSync(join(dir, "doc.md"), "# Doc\n\nBody.\n");
  run([...GIT, "add", "-A"]);
  const first = run([...GIT, "commit", "-m", "init"]);
  assert.equal(first.status, 0, first.stderr);
  const head = run(["rev-parse", "HEAD"]);
  assert.equal(head.status, 0, head.stderr);
  return { dir, base: head.stdout.trim() };
}

function writeCodestyleDoc(dir, base, generated) {
  writeFileSync(
    join(dir, "CODESTYLE.md"),
    ["---", "codestyle: 1", `generated: ${generated}`, `base: ${base}`, "---", "", "# Conventions"].join("\n"),
  );
}

function codeCommit(dir) {
  writeFileSync(join(dir, "src.ts"), `export const x = ${Date.now()};\n`);
  spawnSync("git", [...GIT, "add", "-A"], { cwd: dir });
  return spawnSync("git", [...GIT, "commit", "-m", "code"], { cwd: dir, encoding: "utf8" });
}

function runHook(payload, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
}

test("hook: a stale CODESTYLE.md after a git operation — a signal with a question to the user", () => {
  const { dir, base } = gitProject();
  assert.equal(codeCommit(dir).status, 0);
  writeCodestyleDoc(dir, base, "2020-01-01");
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git commit -m x" }, cwd: dir }, dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /git-watch: the tree changed under you/);
  assert.match(r.stderr, /ask the user/);
  assert.match(r.stderr, /1 code commits/);
});

test("hook: the index diverged from the disk — a rebuild signal without a question", () => {
  const { dir } = gitProject();
  // the index was built from the old content; the document has changed since (as after a checkout)
  const indexFile = join(dir, ".kbindex", "index.json");
  mkdirSync(join(dir, ".kbindex"), { recursive: true });
  const oldHash = createHash("sha1").update("# Doc\n\nBody.\n").digest("hex");
  writeFileSync(indexFile, JSON.stringify({ schema: 1, records: [{ path: "doc.md", hash: oldHash }] }));
  writeFileSync(join(dir, "doc.md"), "# Doc\n\nChanged body.\n");
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git checkout main" }, cwd: dir }, dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /rebuild it now, it is derived data/);
  assert.match(r.stderr, /kb\.mjs" build --project/);
  assert.ok(!r.stderr.includes("ask the user"), "the index is derived data, no question is needed");
});

test("hook: everything is fine (a fresh doc, an in-sync index) — silence", () => {
  const { dir, base } = gitProject();
  const csText = ["---", "codestyle: 1", `generated: ${TODAY}`, `base: ${base}`, "---", "", "# Conventions"].join("\n");
  writeCodestyleDoc(dir, base, TODAY);
  // commit both artifacts so untracked files do not make the index honestly stale
  spawnSync("git", [...GIT, "add", "-A"], { cwd: dir });
  spawnSync("git", [...GIT, "commit", "-m", "docs only"], { cwd: dir });
  const records = [
    { path: "doc.md", hash: computeHash("# Doc\n\nBody.\n") },
    { path: "CODESTYLE.md", hash: computeHash(csText) },
  ];
  mkdirSync(join(dir, ".kbindex"), { recursive: true });
  writeFileSync(join(dir, ".kbindex", "index.json"), JSON.stringify({ schema: 1, records }));
  const r = runHook({ tool_name: "Bash", tool_input: { command: "git commit -m x" }, cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("hook: non tree-changing commands and garbage — silence", () => {
  const { dir } = gitProject();
  for (const command of ["git status", "git push origin main", "npm test"]) {
    const r = runHook({ tool_name: "Bash", tool_input: { command }, cwd: dir }, dir);
    assert.equal(r.status, 0, command);
  }
  const garbage = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", cwd: dir });
  assert.equal(garbage.status, 0);
  const otherTool = runHook({ tool_name: "Edit", tool_input: { file_path: "x.ts" }, cwd: dir }, dir);
  assert.equal(otherTool.status, 0);
});

test("hook: git -C <dir> — the named directory is the one checked", () => {
  const { dir, base } = gitProject();
  assert.equal(codeCommit(dir).status, 0);
  writeCodestyleDoc(dir, base, "2020-01-01");
  const parent = dirname(dir);
  const r = runHook({ tool_name: "Bash", tool_input: { command: `git -C "${dir}" commit -m x` }, cwd: parent }, parent);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ask the user/);
});
