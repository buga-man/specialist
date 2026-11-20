/**
 * Tests for mutation-guard-core.mjs — the outward-mutation classifier.
 * The bar of every case: pushes, history rewrites, forced discards, and the hook
 * bypasses (--no-verify, a displaced core.hooksPath) are named for the block; plain
 * commits and ordinary work stay invisible to the guard (fail-safe — an unrecognized
 * shape is the host permission flow's business, and it is the opt-in adapter that
 * decides when any of this matters).
 * Run: node --test hooks/lib/mutation-guard-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMutation } from "./mutation-guard-core.mjs";

const blocked = (cmd) => {
  const r = decideMutation(cmd);
  assert.ok(r, cmd);
  assert.equal(r.action, "block", cmd);
  assert.equal(r.reason.includes("\n"), false, "reason must be a single line");
  assert.match(r.reason, /^mutation-guard: "/);
  assert.match(r.reason, /user's explicit command/);
  return r;
};
const blockedBypass = (cmd) => {
  const r = decideMutation(cmd);
  assert.ok(r, cmd);
  assert.equal(r.action, "block", cmd);
  assert.equal(r.reason.includes("\n"), false, "reason must be a single line");
  assert.match(r.reason, /^mutation-guard: "/);
  assert.match(r.reason, /git hooks — this shape skips them/);
  assert.match(r.reason, /user's decision/);
  return r;
};
const allowed = (cmd) => assert.equal(decideMutation(cmd), null, cmd);

test("the outward and history shapes are blocked", () => {
  blocked("git push");
  blocked("git push origin main");
  blocked("git push --force-with-lease origin main");
  blocked("git -c user.name=x push origin main"); // global -c settings must not hide the push
  blocked("git -c user.name=x -c receive.denyCurrentBranch=x push"); // and they repeat
  blocked("git -C ../other -c user.name=x push"); // interleaved with -C, in any order
  blocked("git reset --hard HEAD~2");
  blocked("git reset -q --hard origin/main");
  blocked("git rebase main");
  blocked("git rebase --abort");
  blocked("git clean -fd");
  blocked("git branch -D feat/x");
  blocked("git branch --delete --force feat/x");
  blocked("git branch -d --force feat/x");
  blocked("git checkout -- .");
  blocked("git checkout -- src/index.ts");
  blocked("git checkout HEAD~2 -- src/index.ts"); // a ref before -- discards even deeper
  blocked("git checkout main -- src/");
  blocked("git stash drop");
  blocked("git stash drop stash@{2}");
  blocked("git stash clear");
  blocked("git restore .");
  blocked("git restore --staged --worktree src/index.ts"); // --worktree discards even next to --staged
  blocked("git restore --worktree src/index.ts");
  blocked("git restore src/index.ts");
});

test("git -C <dir> prefixes are seen through", () => {
  blocked("git -C ../other push");
  blocked("git -C src reset --hard HEAD");
});

test("a chain is blocked by its mutating link, wherever it sits", () => {
  blocked("git status && git push");
  blocked("git push && git status");
  blocked("npm test; git push origin main");
  blocked("git log --oneline -3\ngit restore .");
});

test("commits and ordinary work are not the guard's business", () => {
  allowed("git commit -m 'one task = one commit'");
  allowed("git add src && git commit -m x");
  allowed("git status");
  allowed("git log --oneline -5");
  allowed("git checkout main"); // a branch switch, not a discard
  allowed("git checkout -b feature/x"); // branch creation carries no paths
  allowed("git branch feature/x"); // create, not delete
  allowed("git branch -d merged-branch"); // plain delete of a merged branch — not here
  allowed("git stash"); // saving a stash is safe — only drop/clear destroy
  allowed("git stash pop"); // restores, does not discard
  allowed("git restore --staged src/index.ts"); // unstages, discards nothing
  allowed("git reset --soft HEAD~1"); // moves a pointer, keeps the tree
  allowed("git pull");
  allowed("npm test");
  allowed("echo 'push the branch please'");
  allowed("");
  allowed(null);
  allowed(undefined);
});

test("hook bypasses: --no-verify commits and pushes are blocked", () => {
  blockedBypass("git commit --no-verify");
  blockedBypass("git commit --no-verify -m 'x'");
  blockedBypass("git commit -m 'x' --no-verify");
  blockedBypass("git commit --amend --no-verify");
  blockedBypass("git commit -n"); // the short form
  blockedBypass("git commit -n -m 'x'");
  blockedBypass("git commit -nm 'x'"); // -n inside a cluster, before the message flag
  blockedBypass("git commit -qnm 'x'"); // deeper into the cluster
  blockedBypass("git -C ../other commit --no-verify");
  blockedBypass("git push --no-verify");
  blockedBypass("git push --no-verify origin main");
});

test("hook bypasses: a displaced core.hooksPath is blocked on any command", () => {
  blockedBypass("git -c core.hooksPath=/tmp/x commit");
  blockedBypass("git -c core.hooksPath= commit"); // empty — hooks disabled outright
  blockedBypass("git -c core.hookspath=/tmp/x push"); // git normalizes config keys to lowercase
  blockedBypass('git -c "core.hooksPath=/tmp/my hooks" commit'); // quoted value
  blockedBypass("git -C .. -c core.hooksPath=/x push"); // global options interleave
  blockedBypass("git -c user.name=y -c core.hooksPath=/x commit"); // and repeat
  blockedBypass("git -c user.name=y commit --no-verify"); // a plain -c must not hide the bypass either
  blockedBypass("git -c core.hooksPath=/x rebase main"); // the command itself is irrelevant
});

test("hook bypasses: the block carries the bypass reason, not the push reason", () => {
  const r = decideMutation("git push --no-verify origin main");
  assert.match(r.reason, /bypasses the push hooks/);
  assert.doesNotMatch(r.reason, /pushes to a remote/, "the sharper reading wins");
  const inChain = decideMutation("git add . && git commit --no-verify -m 'ship it'");
  assert.match(inChain.reason, /"git commit --no-verify -m 'ship it'"/, "the segment is named");
  assert.match(inChain.reason, /bypasses the commit hooks/);
});

test("plain commits with -m/-c and dry-run pushes are not bypass reads", () => {
  allowed('git commit -m "mention --no-verify in the docs"'); // a quoted message is one token
  allowed("git commit -am 'x'"); // a cluster without an n
  allowed("git commit -amn"); // -m swallows the rest: -a -m"n", not a no-verify
  allowed("git commit --amend -m 'y'");
  allowed("git -c user.name=y commit"); // ordinary inline configuration
  allowed("git -c user.email=a@b.c commit -m 'x'");
  allowed("git -c core.pager=cat log");
  // A push's `-n` is --dry-run, not a bypass — but the plain push still blocks as a push.
  const dryRun = decideMutation("git push -n");
  assert.match(dryRun.reason, /pushes to a remote/);
});
