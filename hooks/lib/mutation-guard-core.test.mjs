/**
 * Tests for mutation-guard-core.mjs — the outward-mutation classifier.
 * The bar of every case: pushes, history rewrites, and forced discards are named for
 * the block; commits and ordinary work stay invisible to the guard (fail-safe — an
 * unrecognized shape is the host permission flow's business, and it is the opt-in
 * adapter that decides when any of this matters).
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
const allowed = (cmd) => assert.equal(decideMutation(cmd), null, cmd);

test("the outward and history shapes are blocked", () => {
  blocked("git push");
  blocked("git push origin main");
  blocked("git push --force-with-lease origin main");
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
