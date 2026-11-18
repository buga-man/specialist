/**
 * Tests for skill-gate-core.mjs — the stage-skill gate of the fast SDD profile and
 * the role gate of the `role:` profile.
 * Run: node --test hooks/lib/skill-gate-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, normalizeSkillName, STAGE_SKILLS } from "./skill-gate-core.mjs";

test("normalizeSkillName: trim, leading slash, plugin prefix, lowercase", () => {
  assert.equal(normalizeSkillName("  brainstorm  "), "brainstorm");
  assert.equal(normalizeSkillName("/brainstorm"), "brainstorm");
  assert.equal(normalizeSkillName("specialist:brainstorm"), "brainstorm");
  assert.equal(normalizeSkillName("Brainstorm"), "brainstorm");
  assert.equal(normalizeSkillName("spec-implementation"), "spec-implementation");
});

test("normalizeSkillName: unknown forms read as an empty name (fail-open)", () => {
  assert.equal(normalizeSkillName(undefined), "");
  assert.equal(normalizeSkillName(null), "");
  assert.equal(normalizeSkillName(42), "42");
  assert.equal(normalizeSkillName(""), "");
  assert.equal(normalizeSkillName("   "), "");
});

test("decide: fast blocks all three stage skills, the reason is a single line with instructions", () => {
  for (const skill of STAGE_SKILLS) {
    const r = decide({ mode: "fast", skill });
    assert.equal(r.action, "block", skill);
    assert.equal(r.reason.includes("\n"), false, "reason must be a single line");
    assert.match(r.reason, /^skill-gate: "/);
    assert.match(r.reason, new RegExp(`"${skill}" is a full-pipeline stage`));
    assert.match(r.reason, /`fast` SDD profile/);
    assert.match(r.reason, /mini-spec/);
    assert.match(r.reason, /docs\/plans\//);
    assert.match(r.reason, /spec-implementation/);
    assert.match(r.reason, /`soft`/);
    assert.match(r.reason, /restore `fast`/);
  }
});

test("decide: name normalization before the check — /brainstorm and plugin:brainstorm are blocked", () => {
  assert.equal(decide({ mode: "fast", skill: "/brainstorm" }).action, "block");
  assert.equal(decide({ mode: "fast", skill: "specialist:brainstorm" }).action, "block");
  assert.equal(decide({ mode: "fast", skill: "  /System-Thinking  " }).action, "block");
});

test("decide: non-fast modes allow everything", () => {
  for (const mode of ["soft", "hard", "off", "", undefined, "FAST"]) {
    assert.equal(decide({ mode, skill: "brainstorm" }).action, "allow", String(mode));
  }
});

test("decide: unknown skills and unknown forms — allow (fail-open)", () => {
  assert.equal(decide({ mode: "fast", skill: "lazy" }).action, "allow");
  assert.equal(decide({ mode: "fast", skill: "spec-implementation" }).action, "allow");
  assert.equal(decide({ mode: "fast", skill: "" }).action, "allow");
  assert.equal(decide({ mode: "fast", skill: undefined }).action, "allow");
  assert.equal(decide({ mode: "fast" }).action, "allow");
  assert.equal(decide({}).action, "allow");
});

test("STAGE_SKILLS: exactly the three pipeline stage skills", () => {
  assert.deepEqual([...STAGE_SKILLS], ["brainstorm", "system-thinking", "decompositor"]);
});

test("decide: a pinned role blocks another role's skill — single line, dispatch protocol in the reason", () => {
  const r = decide({ mode: "soft", role: "qa", skill: "brainstorm" });
  assert.equal(r.action, "block");
  assert.equal(r.reason.includes("\n"), false, "reason must be a single line");
  assert.match(r.reason, /^skill-gate: "brainstorm"/);
  assert.match(r.reason, /belongs to the analyst role/);
  assert.match(r.reason, /role: qa/);
  assert.match(r.reason, /dispatch options/);
  assert.match(r.reason, /update \.spec-gate to role: analyst/);
});

test("decide: the pinned role allows its own skills, dispatch, every role-* entry, and unknown skills", () => {
  for (const skill of ["spec-review", "stand-acceptance", "code-review", "bug-hunt", "role-qa"]) {
    assert.equal(decide({ mode: "soft", role: "qa", skill }).action, "allow", skill);
  }
  assert.equal(decide({ mode: "soft", role: "qa", skill: "dispatch" }).action, "allow");
  for (const skill of ["role-analyst", "role-dev"]) {
    assert.equal(decide({ mode: "soft", role: "qa", skill }).action, "allow", skill);
  }
  // a third-party skill the roles map does not know — not ours to gate
  assert.equal(decide({ mode: "soft", role: "qa", skill: "some-other-skill" }).action, "allow");
});

test("decide: the role check normalizes names — plugin prefixes are blocked too", () => {
  assert.equal(decide({ mode: "soft", role: "qa", skill: "specialist-analyst:brainstorm" }).action, "block");
  assert.equal(decide({ mode: "soft", role: "qa", skill: "/Brainstorm" }).action, "block");
});

test("decide: an unknown role is not pinned — everything is allowed (fail-open)", () => {
  for (const role of ["develop", "", undefined]) {
    assert.equal(decide({ mode: "soft", role, skill: "brainstorm" }).action, "allow", String(role));
  }
});

test("decide: fast wins over the role — a pinned analyst still cannot run a stage skill in fast", () => {
  const r = decide({ mode: "fast", role: "analyst", skill: "brainstorm" });
  assert.equal(r.action, "block");
  assert.match(r.reason, /fast` SDD profile/);
});
