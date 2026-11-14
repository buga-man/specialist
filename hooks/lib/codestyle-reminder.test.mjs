/**
 * Tests for codestyle-reminder.mjs and scripts/codestyle.mjs — the SessionStart
 * reminder and the status CLI over a real git repository in a temp dir.
 * Run: node --test hooks/lib/codestyle-reminder.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REMINDER = join(HERE, "codestyle-reminder.mjs");
const CLI = join(HERE, "..", "..", "skills", "codestyle", "scripts", "codestyle.mjs");
const TODAY = new Date().toISOString().slice(0, 10);
const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const GIT = ["-c", "user.email=t@t", "-c", "user.name=t"];

/** A temp dir with an initialized git repo and one commit; returns { dir, base } (full hash). */
function gitProject() {
  const dir = mkdtempSync(join(tmpdir(), "codestyle-"));
  dirs.push(dir);
  const run = (args) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  run(["init"]);
  writeFileSync(join(dir, "start.txt"), "start\n");
  run([...GIT, "add", "-A"]);
  const first = run([...GIT, "commit", "-m", "init"]);
  assert.equal(first.status, 0, first.stderr);
  const head = run(["rev-parse", "HEAD"]);
  assert.equal(head.status, 0, head.stderr);
  return { dir, base: head.stdout.trim() };
}

/** Writes a valid CODESTYLE.md with the given frontmatter values. */
function writeDoc(dir, base, generated) {
  writeFileSync(
    join(dir, "CODESTYLE.md"),
    ["---", "codestyle: 1", `generated: ${generated}`, `base: ${base}`, "---", "", "# Conventions"].join("\n"),
  );
}

function runReminder(payload, cwd) {
  return spawnSync(process.execPath, [REMINDER], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd });
}

/** One commit touching a code file. */
function codeCommit(dir) {
  writeFileSync(join(dir, "src.ts"), `export const x = ${Date.now()};\n`);
  spawnSync("git", [...GIT, "add", "-A"], { cwd: dir });
  return spawnSync("git", [...GIT, "commit", "-m", "code"], { cwd: dir, encoding: "utf8" });
}

test("hook: no CODESTYLE.md — silence", () => {
  const dir = mkdtempSync(join(tmpdir(), "codestyle-"));
  dirs.push(dir);
  const r = runReminder({ cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("hook: broken frontmatter — silence", () => {
  const { dir } = gitProject();
  writeFileSync(join(dir, "CODESTYLE.md"), "# no frontmatter\n");
  const r = runReminder({ cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("hook: a fresh document — silence", () => {
  const { dir, base } = gitProject();
  writeDoc(dir, base, TODAY);
  const r = runReminder({ cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("hook: 31 code commits past base — one reminder line", () => {
  const { dir, base } = gitProject();
  for (let i = 0; i < 31; i++) assert.equal(codeCommit(dir).status, 0);
  writeDoc(dir, base, "2026-01-01");
  const r = runReminder({ cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /CODESTYLE\.md may be stale/);
  assert.match(r.stdout, /31 code commits/);
  assert.equal(r.stdout.split("\n").filter(Boolean).length, 1);
});

test("hook: markdown-only commits do not stale the document", () => {
  const { dir, base } = gitProject();
  for (let i = 0; i < 31; i++) {
    writeFileSync(join(dir, `note-${i}.md`), `note ${i}\n`);
    spawnSync("git", [...GIT, "add", "-A"], { cwd: dir });
    spawnSync("git", [...GIT, "commit", "-m", "docs only"], { cwd: dir });
  }
  writeDoc(dir, base, TODAY);
  const r = runReminder({ cwd: dir }, dir);
  assert.equal(r.stdout, "");
});

test("hook: base unknown to git (history rewrite) — silence", () => {
  const { dir } = gitProject();
  writeDoc(dir, "0123456789abcdef0123456789abcdef01234567", "2026-01-01");
  const r = runReminder({ cwd: dir }, dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("cli: no document — doc missing, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "codestyle-"));
  dirs.push(dir);
  const r = runCli(["status", "--project", dir], dir);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { doc: "missing" });
});

test("cli: broken frontmatter — doc broken", () => {
  const { dir } = gitProject();
  writeFileSync(join(dir, "CODESTYLE.md"), "---\ncodestyle: 1\n---\n");
  const r = runCli(["status", "--project", dir], dir);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { doc: "broken" });
});

test("cli: a fresh document — verdict ok, stale false", () => {
  const { dir, base } = gitProject();
  writeDoc(dir, base, new Date().toISOString().slice(0, 10));
  const r = runCli(["status", "--project", dir], dir);
  const verdict = JSON.parse(r.stdout);
  assert.equal(verdict.doc, "ok");
  assert.equal(verdict.stale, false);
  assert.equal(verdict.codeCommits, 0);
  assert.equal(verdict.base, base);
});

test("cli: one code commit and an old date — stale true", () => {
  const { dir, base } = gitProject();
  assert.equal(codeCommit(dir).status, 0);
  writeDoc(dir, base, "2020-01-01");
  const r = runCli(["status"], dir); // without --project: resolved via the git root from cwd
  const verdict = JSON.parse(r.stdout);
  assert.equal(verdict.stale, true);
  assert.equal(verdict.codeCommits, 1);
  assert.ok(verdict.days >= 30);
});

test("cli: unknown command — a usage error, not a stack trace", () => {
  const r = runCli(["rebuild"], process.cwd());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage/);
});

test("cli: --project without a value — a usage error, not a stack trace", () => {
  const r = runCli(["status", "--project"], process.cwd());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--project needs a directory/);
});
