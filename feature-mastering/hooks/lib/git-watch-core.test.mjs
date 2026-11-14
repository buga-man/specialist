/**
 * Tests for git-watch-core.mjs — parsing of tree-changing git commands and the signal.
 * Pure functions, no I/O and no mocks.
 * Run: node --test feature-mastering/hooks/lib/git-watch-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signalMessage, treeChangingCommands } from "./git-watch-core.mjs";

test("tree-changing: the main operations are recognized", () => {
  for (const cmd of [
    "git commit -am 'msg'",
    "git checkout main",
    "git checkout -- src/x.ts",
    "git switch -c feat",
    "git merge main",
    "git rebase main",
    "git rebase --continue",
    "git pull --rebase origin main",
    "git reset --hard HEAD~1",
    "git cherry-pick abc123",
    "git stash pop",
    "git stash apply",
  ]) {
    assert.ok(treeChangingCommands(cmd).length === 1, cmd);
  }
});

test("tree-changing: compound commands and git -C", () => {
  const mixed = treeChangingCommands("npm test && git commit -m x || git status");
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].sub, "commit");
  const withDir = treeChangingCommands("git -C sub checkout main");
  assert.equal(withDir[0].dir, "sub");
  assert.equal(withDir[0].sub, "checkout");
});

test("not tree-changing: status, add, push, stash list, non-git — silence", () => {
  for (const cmd of [
    "git status",
    "git add -A",
    "git push origin main",
    "git stash list",
    "git stash save wip",
    "git log --oneline",
    "git diff",
    "gitk --all",
    "echo git commit",
    "npm test",
    "",
  ]) {
    assert.equal(treeChangingCommands(cmd).length, 0, cmd);
  }
});

const KB = "C:/plugins/feature-mastering/skills/kb-index/scripts/kb.mjs";
const DIR = "C:/proj";

test("signalMessage: both artifacts — both parts, the rebuild and the question to the user", () => {
  const msg = signalMessage({
    index: { changed: 2, added: 1, missing: 0 },
    codestyle: { doc: "ok", stale: true, codeCommits: 34, days: 41, base: "a1b2c3d4e5f60718", generated: "2026-10-01" },
    kbCli: KB,
    projectDir: DIR,
  });
  assert.ok(msg.startsWith("git-watch: the tree changed under you"));
  assert.ok(msg.includes("(2 changed, 1 added, 0 removed)"));
  assert.ok(msg.includes(`node "${KB}" build --project "${DIR}"`));
  assert.ok(msg.includes("rebuild it now, it is derived data"));
  assert.ok(msg.includes("(34 code commits, 41 days since base a1b2c3d)"));
  assert.ok(msg.includes("ask the user"));
});

test("signalMessage: only one artifact — only its part", () => {
  const onlyIndex = signalMessage({ index: { changed: 0, added: 3, missing: 1 }, codestyle: null, kbCli: KB, projectDir: DIR });
  assert.ok(onlyIndex.includes("rebuild it now"));
  assert.ok(!onlyIndex.includes("CODESTYLE.md"));
  const onlyStyle = signalMessage({ index: null, codestyle: { doc: "ok", stale: true, codeCommits: 30, days: null, base: "a1b2c3d4e5f60718", generated: "2026-10-01" }, kbCli: KB, projectDir: DIR });
  assert.ok(onlyStyle.includes("ask the user"));
  assert.ok(!onlyStyle.includes("documentation index"));
});

test("signalMessage: null without findings; a broken date does not break the string", () => {
  assert.equal(signalMessage({ index: null, codestyle: null, kbCli: KB, projectDir: DIR }), null);
  const noDays = signalMessage({ index: null, codestyle: { doc: "ok", stale: true, codeCommits: 30, days: null, base: "a1b2c3d4e5f60718", generated: "bad" }, kbCli: KB, projectDir: DIR });
  assert.ok(noDays.includes("30 code commits since base"));
  assert.ok(!noDays.includes("days,") && !noDays.includes("null"));
});
