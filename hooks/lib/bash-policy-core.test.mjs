/**
 * Tests for bash-policy-core.mjs — the read-only auto-approval policy.
 * The bar of every case: a command is approved only when all its segments are
 * provably read-only, workspace-bound, and free of side-effect plumbing — everything
 * else, including every parse doubt, reads as "none" (fail-closed).
 * Run: node --test hooks/lib/bash-policy-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideApproval, splitSegments } from "./bash-policy-core.mjs";

const allow = (cmd) => assert.equal(decideApproval(cmd).decision, "allow", cmd);
const none = (cmd) => assert.equal(decideApproval(cmd).decision, "none", cmd);

test("splitSegments: chained commands split into parts, empties dropped", () => {
  assert.deepEqual(splitSegments("git status && git log -1"), ["git status", "git log -1"]);
  assert.deepEqual(splitSegments("git status; git diff || pwd"), ["git status", "git diff", "pwd"]);
  assert.deepEqual(splitSegments("  git status  \n\n  pwd "), ["git status", "pwd"]);
  assert.deepEqual(splitSegments(""), []);
});

test("the allow-list: bare read-only inspections are approved", () => {
  allow("git status");
  allow("git log");
  allow("git log --oneline -5");
  allow("git diff");
  allow("git diff HEAD~1");
  allow("git diff main...feat --stat");
  allow("git show");
  allow("git show HEAD:package.json");
  allow("git blame src/index.ts");
  allow("git branch");
  allow("git branch -a");
  allow("git branch -vv");
  allow("git branch --list feat-*");
  allow("git branch --list");
  allow("git remote");
  allow("git remote -v");
  allow("ls");
  allow("ls -la src");
  allow("cat README.md");
  allow("cat docs/hooks.md docs/skills.md");
  allow("pwd");
  allow("test -e .spec-gate");
  allow("test -f package.json");
});

test("chaining: every segment must pass — one mutating link poisons the chain", () => {
  allow("git status && git log --oneline -3");
  allow("ls && cat README.md && pwd");
  none("git status && git push");
  none("git log && rm -rf build");
  none("git diff; echo done");
});

test("side-effect plumbing: redirection, pipes, substitution, background — none", () => {
  none("git log > out.txt");
  none("git diff >> out.txt");
  none("git log --output=out.txt"); // --output writes a file
  none("cat README.md | grep x");
  none("git log $(git rev-parse HEAD)");
  none("git status &");
  none("git status < input.txt");
});

test("workspace-bound: absolute paths, parent escapes, and home never pass", () => {
  none("cat /etc/passwd");
  none("cat C:/Users/x/secret");
  none("cat ../../outside.md");
  none("git log ../other-repo");
  none("cat ~/notes.txt");
  none("git -C .. log");
});

test("git -C stays inside the workspace; safe relative directories pass", () => {
  allow("git -C src log --oneline -3");
  allow("git -C . status");
  none("git -C /tmp log");
});

test("unknown heads and mutating git subcommands are none (fail-closed)", () => {
  none("rm -rf build");
  none("npm test");
  none("echo hello");
  none("git commit -m x");
  none("git push origin main");
  none("git checkout main");
  none("git add src");
  none("git branch -D feat/x");
  none("git branch new-branch");
  none("git remote add origin git@x"); // remote with a subcommand mutates config
  none("grep -r pattern src"); // not on the list, however harmless it looks
  none("find . -name x");
  none("cat --nonexistent-flag-shape -x=1 README.md"); // unknown flag shapes stay out
});

test("unknown forms read as none (fail-closed)", () => {
  none("");
  none(null);
  none(undefined);
  none("   ");
});
