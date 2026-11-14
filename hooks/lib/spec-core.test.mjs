/**
 * Tests for spec-core.mjs — the plan contract of the spec-gate hook.
 * Run: node --test hooks/lib/spec-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { activePlanInfo, applyPatchPaths, decide, editedFilePaths, isAlwaysAllowed, readMode } from "./spec-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Temp project dir; files are created by path ("/"-separated keys). */
function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "spec-core-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const PLAN = [
  "# Plan",
  "",
  "### Task 1: Add export endpoint",
  "- Files: `src/api/export.ts`, `./src/api/export.test.ts`",
  "- Do:",
  "  1. write code",
  "- [x] write tests", // progress checkbox — must not close the task
  "",
  "### Task 2: Wire route",
  "- Files: `src/routes.ts`",
  "",
  "### Task 3: Styles",
  "- Files: `src/**/*.css`",
  "",
].join("\n");

test("readMode: soft by default, hard/off honored, garbage falls back", () => {
  const dir = project({});
  assert.equal(readMode(dir), "soft");
  writeFileSync(join(dir, ".spec-gate"), "hard\n");
  assert.equal(readMode(dir), "hard");
  writeFileSync(join(dir, ".spec-gate"), "OFF");
  assert.equal(readMode(dir), "off");
  writeFileSync(join(dir, ".spec-gate"), "sometimes");
  assert.equal(readMode(dir), "soft");
});

test("readMode: fast is accepted, case-insensitively", () => {
  const dir = project({});
  writeFileSync(join(dir, ".spec-gate"), "fast\n");
  assert.equal(readMode(dir), "fast");
  writeFileSync(join(dir, ".spec-gate"), "FAST");
  assert.equal(readMode(dir), "fast");
});

test("decide (fast): file gate behaves exactly like soft", () => {
  const dir = project({ "docs/plans/p.md": PLAN });
  const edit = (p) => decide({ projectDir: dir, filePath: p, mode: "fast" });
  assert.equal(edit("src/api/export.ts").action, "allow"); // inside the open task's file list
  assert.equal(edit("src/other.ts").action, "block"); // outside the plan — scope creep
  assert.equal(edit("docs/specs/x.md").action, "allow"); // docs stay editable

  const bare = project({ ".spec-gate": "fast\n" }); // no open tasks — soft behavior
  assert.equal(decide({ projectDir: bare, filePath: "src/x.ts", mode: "fast" }).action, "allow");
});

test("isAlwaysAllowed: docs and markdown always, code never, .spec-gate is not exempt", () => {
  assert.equal(isAlwaysAllowed("docs/specs/2026-01-01-topic.md"), true);
  assert.equal(isAlwaysAllowed("docs/plans/p.md"), true);
  assert.equal(isAlwaysAllowed("README.md"), true);
  assert.equal(isAlwaysAllowed("src/x.ts"), false);
  assert.equal(isAlwaysAllowed(".spec-gate"), false);
});

test("activePlanInfo: open tasks, globs, ./ stripping", () => {
  const info = activePlanInfo(project({ "docs/plans/p.md": PLAN }));
  assert.equal(info.hasOpenTasks, true);
  assert.deepEqual(
    [...info.openFiles].sort(),
    ["src/**/*.css", "src/api/export.test.ts", "src/api/export.ts", "src/routes.ts"].sort(),
  );
});

test("closure: only explicit Done-markers close a task", () => {
  const open = (marker) =>
    activePlanInfo(
      project({ "docs/plans/p.md": `### Task 1: X\n- Files: \`src/a.ts\`\n${marker}\n` }),
    ).hasOpenTasks;
  assert.equal(open("- Done: abc123"), false);
  assert.equal(open("- done — verified"), false);
  assert.equal(open("- [x] Done: abc"), false);
  assert.equal(open("- [x] write tests"), true); // checkbox without a Done marker
  assert.equal(open("- [x] done with step 3"), true); // "done" without ":" is prose
  assert.equal(open("- Done implementation work"), true); // no separator after the word
});

test("regression: a stray progress checkbox keeps the gate active (was: silent fail-open)", () => {
  const dir = project({
    "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n- Do:\n  1. step\n- [x] step done\n",
  });
  assert.equal(activePlanInfo(dir).hasOpenTasks, true);
  assert.equal(decide({ projectDir: dir, filePath: "src/other.ts", mode: "soft" }).action, "block");
});

test("regression: mid-task checkbox does not block the task's own files (was: false block)", () => {
  const dir = project({
    "docs/plans/p.md":
      "### Task 1: X\n- Files: `src/a.ts`\n- [x] step\n\n### Task 2: Y\n- Files: `src/b.ts`\n",
  });
  assert.equal(decide({ projectDir: dir, filePath: "src/a.ts", mode: "soft" }).action, "allow");
});

test("decide (soft, open plan): scope enforcement, globs, gated mode file", () => {
  const dir = project({ "docs/plans/p.md": PLAN });
  const edit = (p) => decide({ projectDir: dir, filePath: p, mode: "soft" });
  assert.equal(edit("src/api/export.ts").action, "allow");
  assert.equal(edit("src/other.ts").action, "block");
  assert.equal(edit("docs/specs/x.md").action, "allow");
  assert.equal(edit("docs/plans/p.md").action, "allow");
  assert.equal(edit(".spec-gate").action, "block"); // the agent cannot weaken the gate mid-plan
  assert.equal(edit("src/theme.css").action, "allow"); // glob match
  assert.equal(edit("src/deep/theme.css").action, "allow"); // ** crosses directories
  assert.equal(edit("src/theme.ts").action, "block"); // wrong extension for the glob
});

test("decide: soft without a plan allows, off allows, hard blocks and defers to the user", () => {
  const bare = project({});
  assert.equal(decide({ projectDir: bare, filePath: "src/x.ts", mode: "soft" }).action, "allow");
  assert.equal(decide({ projectDir: bare, filePath: "src/x.ts", mode: "off" }).action, "allow");
  const hard = decide({ projectDir: bare, filePath: "src/x.ts", mode: "hard" });
  assert.equal(hard.action, "block");
  assert.match(hard.reason, /ask the user/);
  assert.equal(decide({ projectDir: bare, filePath: "docs/x.md", mode: "hard" }).action, "allow");
});

test("decide: a closed task's files are blocked while another task is open", () => {
  const dir = project({
    "docs/plans/p.md":
      "### Task 1: A\n- Files: `src/a.ts`\n- Done: abc\n\n### Task 2: B\n- Files: `src/b.ts`\n",
  });
  assert.equal(decide({ projectDir: dir, filePath: "src/a.ts", mode: "soft" }).action, "block");
  assert.equal(decide({ projectDir: dir, filePath: "src/b.ts", mode: "soft" }).action, "allow");
});

test("decide: plan without parsable Files lines is fail-safe (allow)", () => {
  const dir = project({ "docs/plans/p.md": "### Task 1: X\n- Do: something\n" });
  assert.equal(decide({ projectDir: dir, filePath: "src/x.ts", mode: "soft" }).action, "allow");
});

test("regression: a Files line with no backticked paths blocks instead of silently opening the gate", () => {
  // Each of these has a "- Files:" line whose paths never parse — previously the whole
  // gate fell open, so every edit anywhere was allowed without a word.
  // A closed task is out of scope by design — only open tasks can trigger this.
  const cases = [
    "### Task 1: X\n- Files: src/a.ts\n", // no backticks
    "### Task 1: X\n- Files:\n  1. src/a.ts\n", // paths only in a nested list
  ];
  for (const plan of cases) {
    const dir = project({ "docs/plans/p.md": plan });
    const r = decide({ projectDir: dir, filePath: "src/unrelated.ts", mode: "soft" });
    assert.equal(r.action, "block", plan);
    assert.match(r.reason, /backticks/);
  }
});

test("regression: the plan template's Done placeholder closes nothing it should not", () => {
  // The old template shipped the literal line "- Done: <commit hash> (added by the executor…)",
  // which the gate reads as a real closure — a plan copied from it was fully closed.
  const dir = project({
    "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n",
  });
  assert.equal(activePlanInfo(dir).hasOpenTasks, true);
  assert.equal(decide({ projectDir: dir, filePath: "src/other.ts", mode: "soft" }).action, "block");
});

test("decide: paths outside the project are not our concern", () => {
  // Drive-letter paths are only absolute on Windows; on POSIX the same intent is
  // expressed with a rooted path outside the project.
  const outside =
    process.platform === "win32"
      ? { projectDir: "C:/proj", filePath: "D:/elsewhere/x.ts" }
      : { projectDir: "/proj", filePath: "/elsewhere/x.ts" };
  assert.equal(decide({ ...outside, mode: "hard" }).action, "allow");
});

test("task headings match case-insensitively; paths compare case-insensitively on Windows", () => {
  const dir = project({
    "docs/plans/p.md": "### TASK 1: X\n- Files: `src/api/export.ts`\n",
  });
  const info = activePlanInfo(dir);
  assert.equal(info.hasOpenTasks, true);
  assert.deepEqual(info.openFiles, ["src/api/export.ts"]);
  if (process.platform === "win32") {
    assert.equal(
      decide({ projectDir: dir, filePath: "Src/API/export.ts", mode: "soft" }).action,
      "allow",
    );
  }
});

const PATCH = [
  "*** Begin Patch",
  "*** Update File: src/api/export.ts",
  "@@",
  "-old",
  "+new",
  "*** Add File: ./src/new.ts",
  "+content",
  "*** Delete File: src/old.ts",
  "*** Update File: src/renamed.ts",
  "*** Move to: src/moved.ts",
  "*** End Patch",
].join("\n");

test("applyPatchPaths: Codex apply_patch payload yields deduplicated, normalized targets", () => {
  assert.deepEqual(applyPatchPaths(PATCH), [
    "src/api/export.ts",
    "src/new.ts",
    "src/old.ts",
    "src/renamed.ts",
    "src/moved.ts",
  ]);
});

test("applyPatchPaths: object wrappers, a bare file_path, and unknown shapes", () => {
  // Codex may wrap the patch text in an object field.
  assert.deepEqual(applyPatchPaths({ input: PATCH }), applyPatchPaths(PATCH));
  assert.deepEqual(applyPatchPaths({ patch: PATCH }), applyPatchPaths(PATCH));
  // An explicit file_path wins (Claude Code-style payload reaching the same code path).
  assert.deepEqual(applyPatchPaths({ file_path: "src/a.ts" }), ["src/a.ts"]);
  // A patch without the Begin Patch marker is not a patch; garbage is not a patch.
  assert.equal(applyPatchPaths("no markers here"), null);
  assert.equal(applyPatchPaths({ nothing: true }), null);
  assert.equal(applyPatchPaths(null), null);
});

test("editedFilePaths: explicit file, patch files (capped), unknown shape", () => {
  assert.deepEqual(editedFilePaths({ file_path: "src/a.ts" }), ["src/a.ts"]);
  assert.deepEqual(editedFilePaths({ notebook_path: "n.ipynb" }), ["n.ipynb"]);
  // OpenCode's camelCase field, with the host's leading-@ marker stripped.
  assert.deepEqual(editedFilePaths({ filePath: "@src/a.ts" }), ["src/a.ts"]);
  const many = { input: "*** Begin Patch\n" + Array.from({ length: 25 }, (_, i) => `*** Update File: f${i}.ts`).join("\n") };
  assert.equal(editedFilePaths(many).length, 20); // the default cap bounds absurd payloads
  assert.equal(editedFilePaths(many, 25).length, 25);
  const nine = { input: "*** Begin Patch\n" + Array.from({ length: 9 }, (_, i) => `*** Update File: f${i}.ts`).join("\n") };
  assert.equal(editedFilePaths(nine).length, 9); // realistic patches are never truncated
  assert.deepEqual(editedFilePaths({ nothing: true }), []);
  assert.deepEqual(editedFilePaths(null), []);
});

test("decide: an apply_patch payload is checked file by file — one out-of-scope file blocks", () => {
  const dir = project({
    "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n",
  });
  const patch = "*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: src/escape.ts\n*** End Patch";
  assert.equal(decide({ projectDir: dir, filePath: "src/a.ts", mode: "soft" }).action, "allow");
  assert.equal(decide({ projectDir: dir, filePath: "src/escape.ts", mode: "soft" }).action, "block");
  // The adapter path: every target of the patch is decided; docs targets stay allowed.
  const targets = applyPatchPaths(patch) ?? [];
  const verdicts = targets.map((p) => decide({ projectDir: dir, filePath: p, mode: "soft" }).action);
  assert.deepEqual(verdicts, ["allow", "block"]);
});

test("a fenced example inside a plan is prose, never the contract", () => {
  // A plan that shows the closing contract as an example must not have that example
  // read as a real closure (the fence spans the marker).
  const dir = project({
    "docs/plans/p.md": [
      "### Task 1: X",
      "- Files: `src/a.ts`",
      "- Do:",
      "  1. step",
      "",
      "Example of closing (do NOT write it yourself):",
      "```markdown",
      "- Done: abc123",
      "```",
      "",
      "### Task 2: Y",
      "- Files: `src/b.ts`",
    ].join("\n"),
  });
  const info = activePlanInfo(dir);
  assert.equal(info.hasOpenTasks, true);
  assert.deepEqual([...info.openFiles].sort(), ["src/a.ts", "src/b.ts"]);
});

test("regression: Verify/Revert/Decision-log extras and plan-level sections do not perturb the gate", () => {
  const dir = project({
    "docs/plans/p.md": [
      "### Task 1: X",
      "- Source: [repo spec §2]",
      "- Files: `src/a.ts`",
      "- Risk: touches auth",
      "- Revert: git revert <sha>",
      "- Criteria: AC-1",
      "- Verify: npm test -- a → pass",
      "- Verify (red): npm test -- a → fails before the feature exists",
      "- Commit: feat: a",
      "",
      "### Task 2: Y",
      "- Files: `src/b.ts`",
      "- Verify: npm test -- b → pass",
      "",
      "## Decision log",
      "- 2026-11-14: chose approach A — faster",
      "",
      "## Revert",
      "- Task 2: undo · Task 1: undo",
      "- After rollback: npm test → pass",
    ].join("\n"),
  });
  const info = activePlanInfo(dir);
  assert.equal(info.hasOpenTasks, true);
  assert.equal(info.openTaskCount, 2);
  assert.deepEqual([...info.openFiles].sort(), ["src/a.ts", "src/b.ts"]);
  assert.equal(decide({ projectDir: dir, filePath: "src/other.ts", mode: "soft" }).action, "block");
  assert.equal(decide({ projectDir: dir, filePath: "src/a.ts", mode: "soft" }).action, "allow");
});
