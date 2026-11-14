/**
 * Tests for codestyle-core.mjs — the freshness math of the codestyle artifact.
 * Pure functions, no I/O and no mocks.
 * Run: node --test feature-mastering/skills/codestyle/scripts/lib/codestyle-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countCodeCommits,
  daysSince,
  freshness,
  isCodeFile,
  parseFrontmatter,
  parseGitLog,
  reminderLine,
  todayISO,
} from "./codestyle-core.mjs";

test("frontmatter: a full valid document is parsed", () => {
  const text = [
    "---",
    "codestyle: 1",
    "generated: 2026-11-10",
    "base: a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "---",
    "",
    "# Code conventions",
  ].join("\n");
  assert.deepEqual(parseFrontmatter(text), {
    base: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    generated: "2026-11-10",
  });
});

test("frontmatter: spaces, CRLF and a short hash are allowed", () => {
  const text = "---\r\ncodestyle:  1\r\ngenerated:   2026-11-10\r\nbase:   ABCDEF1\r\n---\ntext";
  assert.deepEqual(parseFrontmatter(text), { base: "abcdef1", generated: "2026-11-10" });
});

test("frontmatter: no codestyle: 1 — null", () => {
  assert.equal(parseFrontmatter("---\ngenerated: 2026-11-10\nbase: abcdef1\n---\n"), null);
});

test("frontmatter: unknown schema (codestyle: 2) — null", () => {
  assert.equal(parseFrontmatter("---\ncodestyle: 2\ngenerated: 2026-11-10\nbase: abcdef1\n---\n"), null);
});

test("frontmatter: a broken hash — null", () => {
  for (const base of ["xyz", "abc", "g1b2c3d", "a".repeat(41)]) {
    assert.equal(parseFrontmatter(`---\ncodestyle: 1\ngenerated: 2026-11-10\nbase: ${base}\n---\n`), null, base);
  }
});

test("frontmatter: a broken date — null", () => {
  for (const generated of ["2026-13-40", "10-11-2026", "yesterday", ""]) {
    assert.equal(parseFrontmatter(`---\ncodestyle: 1\ngenerated: ${generated}\nbase: abcdef1\n---\n`), null, generated);
  }
});

test("frontmatter: no block — null", () => {
  assert.equal(parseFrontmatter("# just markdown"), null);
  assert.equal(parseFrontmatter(""), null);
  assert.equal(parseFrontmatter(null), null);
});

test("isCodeFile: code — yes, markdown and the doc itself — no", () => {
  assert.equal(isCodeFile("src/x.ts"), true);
  assert.equal(isCodeFile("src\\x.js"), true);
  assert.equal(isCodeFile("src/x.snap"), true);
  assert.equal(isCodeFile("README.md"), false);
  assert.equal(isCodeFile("docs/guide.MD"), false);
  assert.equal(isCodeFile("CODESTYLE.md"), false);
});

test("parseGitLog: two commits with files and empty separators", () => {
  // like real git: \x1e opens each commit, an empty line between them
  const stdout = ["\x1eaaaa111", "src/a.ts", "", "\x1ebbbb222", "docs/x.md", "src/b.ts", ""].join("\n");
  assert.deepEqual(parseGitLog(stdout), [
    { hash: "aaaa111", files: ["src/a.ts"] },
    { hash: "bbbb222", files: ["docs/x.md", "src/b.ts"] },
  ]);
});

test("parseGitLog: empty output, garbage and a merge without files", () => {
  assert.deepEqual(parseGitLog(""), []);
  assert.deepEqual(parseGitLog("\x1e\n"), []);
  assert.deepEqual(parseGitLog("\x1enot-a-hash\nsrc/x.ts\n"), []);
  // a merge commit without --name-only files stays in the list with an empty files
  assert.deepEqual(parseGitLog("\x1ecccc333\n"), [{ hash: "cccc333", files: [] }]);
});

test("countCodeCommits: counts only commits with code", () => {
  const commits = [
    { hash: "a1", files: ["README.md"] },
    { hash: "a2", files: ["docs/x.md", "CODESTYLE.md"] },
    { hash: "a3", files: [] }, // merge
    { hash: "a4", files: ["src/a.ts"] },
  ];
  assert.equal(countCodeCommits(commits), 1);
  assert.equal(countCodeCommits([]), 0);
  assert.equal(countCodeCommits(undefined), 0);
});

test("daysSince: whole days, future — null, garbage — null", () => {
  assert.equal(daysSince("2026-11-10", "2026-11-10"), 0);
  assert.equal(daysSince("2026-10-01", "2026-11-11"), 41);
  assert.equal(daysSince("2026-12-01", "2026-11-11"), null);
  assert.equal(daysSince("10.11.2026", "2026-11-11"), null);
  assert.equal(daysSince("2026-11-10", undefined), null);
});

test("todayISO: the local date, not UTC (UTC night rolls a day back)", () => {
  // local components assembled by the Date(Y, M, D) constructor — it is local by definition
  assert.equal(todayISO(new Date(2026, 10, 14)), "2026-11-14");
  assert.equal(todayISO(new Date(2026, 0, 1)), "2026-01-01");
  assert.match(todayISO(new Date()), /^\d{4}-\d{2}-\d{2}$/);
});

test("freshness: the commit threshold and the days threshold trigger independently", () => {
  const today = "2026-11-11";
  const base = "a1b2c3d";
  assert.equal(freshness({ base, generated: "2026-10-01", codeCommits: 34, today }).stale, true);
  assert.equal(freshness({ base, generated: "2026-10-01", codeCommits: 5, today }).stale, true);
  assert.equal(freshness({ base, generated: "2026-11-10", codeCommits: 5, today }).stale, false);
  assert.equal(freshness({ base, generated: "2026-11-10", codeCommits: 30, today }).stale, true);
});

test("freshness: a broken date does not stop the commit threshold", () => {
  const verdict = freshness({ base: "a1b2c3d", generated: "bad", codeCommits: 31, today: "2026-11-11" });
  assert.equal(verdict.stale, true);
  assert.equal(verdict.days, null);
});

test("freshness: a non-number of commits reads as zero", () => {
  const verdict = freshness({ base: "a1b2c3d", generated: "2026-11-10", codeCommits: null, today: "2026-11-11" });
  assert.equal(verdict.stale, false);
  assert.equal(verdict.codeCommits, 0);
});

test("reminderLine: one line, the keys present in the text, no newline", () => {
  const line = reminderLine(
    freshness({ base: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", generated: "2026-10-01", codeCommits: 34, today: "2026-11-11" }),
  );
  assert.equal(line.includes("\n"), false);
  assert.match(line, /^codestyle: CODESTYLE\.md may be stale \(34 code commits, 41 days/);
  assert.match(line, /base a1b2c3d/);
  assert.match(line, /generated 2026-10-01/);
  assert.match(line, /codestyle\.mjs" status/);
});
