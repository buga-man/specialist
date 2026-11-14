/**
 * Tests for plan-context-core.mjs — the session orientation block.
 * Run: node --test hooks/lib/plan-context-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { activePlanInfo } from "./spec-core.mjs";
import { buildPlanContext } from "./plan-context-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "plan-context-"));
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
  "- Files: `src/api/export.ts`",
  "- Done: abc1234",
  "",
  "### Task 2: Wire route",
  "- Files: `src/routes.ts`",
  "",
  "### Task 3: Styles",
  "- Files: `src/**/*.css`",
  "",
].join("\n");

test("no plan or all tasks closed — null (silence)", () => {
  const donePlan = [
    "# Plan",
    "",
    "### Task 1: Add export endpoint",
    "- Files: `src/api/export.ts`",
    "- Done: abc1234",
    "",
  ].join("\n");
  assert.equal(buildPlanContext(project({})), null);
  assert.equal(buildPlanContext(project({ "docs/plans/2026-01-01-t.md": donePlan })), null);
});

test("active plan: count, task titles, the gate and the closure contract", () => {
  const text = buildPlanContext(project({ "docs/plans/2026-01-01-t.md": PLAN }));
  assert.ok(text.startsWith("plan-context: 2 open task(s)"));
  assert.ok(text.includes("2026-01-01-t.md"));
  assert.ok(text.includes("Task 2: Wire route"));
  assert.ok(text.includes("Task 3: Styles"));
  assert.ok(!text.includes("Task 1: Add export endpoint"), "a closed task must not be surfaced");
  assert.ok(text.includes('spec-gate (soft)'));
  assert.ok(text.includes('"- Done: <commit>"'));
  assert.ok(text.includes('checkboxes are progress, not closure'));
});

test("hard mode changes the gate wording; off — full silence", () => {
  const hard = project({ ".spec-gate": "hard\n", "docs/plans/2026-01-01-t.md": PLAN });
  assert.ok(buildPlanContext(hard).includes("spec-gate (hard)"));
  const off = project({ ".spec-gate": "off\n", "docs/plans/2026-01-01-t.md": PLAN });
  assert.equal(buildPlanContext(off), null);
});

test("fast without plans: a single profile block — the fast lane and stage skills", () => {
  const text = buildPlanContext(project({ ".spec-gate": "fast\n" }));
  assert.ok(text, "in fast mode the profile is injected even without open tasks");
  assert.ok(text.includes("SDD profile `fast`"));
  for (const skill of ["brainstorm", "system-thinking", "decompositor"]) {
    assert.ok(text.includes(skill), skill);
  }
  assert.ok(text.includes("mini-spec"));
  assert.ok(!text.includes("plan-context:"), "there must be no orientation without a plan");
});

test("fast with an open plan: plan orientation and the profile block together", () => {
  const dir = project({ ".spec-gate": "fast\n", "docs/plans/2026-01-01-t.md": PLAN });
  const text = buildPlanContext(dir);
  assert.ok(text.startsWith("plan-context: 2 open task(s)"));
  assert.ok(text.includes("spec-gate (soft)"), "for files fast behaves like soft");
  assert.ok(text.includes('checkboxes are progress, not closure'));
  assert.ok(text.includes("SDD profile `fast`"));
  assert.ok(text.includes("skill-gate hook blocks autonomous runs"));
});

test("soft and off without plans — still silence", () => {
  assert.equal(buildPlanContext(project({})), null);
  assert.equal(buildPlanContext(project({ ".spec-gate": "off\n" })), null);
});

test("active plan: many tasks — titles are truncated with an ellipsis", () => {
  const many = Array.from({ length: 7 }, (_, i) => `### Task ${i + 1}: Do thing ${i + 1}\n- Files: \`src/f${i}.ts\``).join("\n\n");
  const text = buildPlanContext(project({ "docs/plans/2026-01-01-t.md": `# Plan\n\n${many}\n` }));
  assert.ok(text.startsWith("plan-context: 7 open task(s)"));
  assert.ok(text.includes("; …"));
});

test("spec-core.activePlanInfo exposes the new fields for plan-context", () => {
  const dir = project({ "docs/plans/2026-01-01-t.md": PLAN });
  const info = activePlanInfo(dir);
  assert.equal(info.openTaskCount, 2);
  assert.deepEqual(info.openPlans, ["2026-01-01-t.md"]);
  assert.deepEqual(info.openTaskTitles, ["Task 2: Wire route", "Task 3: Styles"]);
});

test("onboarding: .spec-gate present, CODESTYLE.md and the index absent — one line without a plan", () => {
  const text = buildPlanContext(project({ ".spec-gate": "soft\n" }));
  assert.ok(text, "an opt-in project gets a reminder even without a plan");
  assert.match(text, /^Onboarding:/);
  assert.ok(text.includes("no CODESTYLE.md"));
  assert.ok(text.includes("no documentation index"));
  assert.ok(text.includes("codestyle skill"));
  assert.ok(text.includes("kb-index skill"));
});

test("onboarding: names only what is missing", () => {
  const withDoc = project({ ".spec-gate": "soft\n", "CODESTYLE.md": "---\ncodestyle: 1\n---\n" });
  const t1 = buildPlanContext(withDoc);
  assert.ok(t1.includes("no documentation index"));
  assert.ok(!t1.includes("no CODESTYLE.md"));
  const withIndex = project({ ".spec-gate": "soft\n", ".kbindex/index.json": '{"schema":1,"records":[]}' });
  const t2 = buildPlanContext(withIndex);
  assert.ok(t2.includes("no CODESTYLE.md"));
  assert.ok(!t2.includes("no documentation index"));
});

test("onboarding: off, a missing .spec-gate and the full set — silence", () => {
  assert.equal(buildPlanContext(project({ ".spec-gate": "off\n" })), null);
  assert.equal(buildPlanContext(project({})), null);
  const full = project({ ".spec-gate": "soft\n", "CODESTYLE.md": "x", ".kbindex/index.json": "{}" });
  assert.equal(buildPlanContext(full), null);
});

test("onboarding with an open plan: orientation and onboarding together", () => {
  const dir = project({ ".spec-gate": "soft\n", "docs/plans/2026-01-01-t.md": PLAN });
  const text = buildPlanContext(dir);
  assert.ok(text.startsWith("plan-context: 2 open task(s)"));
  assert.ok(text.includes("Onboarding:"));
});

test("fast + onboarding: the profile and onboarding in one block without a plan", () => {
  const text = buildPlanContext(project({ ".spec-gate": "fast\n" }));
  assert.ok(text.includes("SDD profile `fast`"));
  assert.ok(text.includes("Onboarding:"));
  assert.ok(text.indexOf("SDD profile") < text.indexOf("Onboarding:"));
});

test("buildPlanContext: an unparsable Files line is named before it blocks every code edit", () => {
  const dir = project({
    "docs/plans/p.md": "### Task 1: X\n- Files: src/a.ts\n", // no backticks — scope unparsable
  });
  const text = buildPlanContext(dir);
  assert.ok(text, "the malformed open task still orients the session");
  assert.match(text, /no backticked paths/);
  assert.match(text, /code edits block/);
});

test("buildPlanContext: a well-formed plan does not carry the unparsed warning", () => {
  const dir = project({
    "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n",
  });
  const text = buildPlanContext(dir);
  assert.ok(text);
  assert.doesNotMatch(text, /no backticked paths/);
});

test("buildPlanContext: a plan ending inside a code fence is named before its tasks vanish", () => {
  const dir = project({
    "docs/plans/p.md": "### Task 1: X\n- Files: `src/a.ts`\n\n```markdown\nan example that never closes\n",
  });
  const text = buildPlanContext(dir);
  assert.ok(text, "the open task still orients the session");
  assert.match(text, /unbalanced/);
  assert.match(text, /invisible to the gate/);
  assert.doesNotMatch(text, /no backticked paths/);
});
