/**
 * Tests for roles.mjs — the role map behind the role plugins and the `role:` profile
 * of the skill-gate. The map's own health against the disk tree is compliance's job
 * (npm run compliance); these are the unit contracts of the map's functions.
 * Run: node --test scripts/roles.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  knownSkills,
  pluginSkills,
  ROLE_MAP,
  roleNames,
  roleOf,
  rolePluginManifests,
  validateRoleMap,
} from "./roles.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const diskSkills = () =>
  readdirSync(join(REPO_ROOT, "skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(REPO_ROOT, "skills", e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();

test("validateRoleMap: the real map covers the disk tree exactly — no orphans, no ghosts, no doubles", () => {
  assert.deepEqual(validateRoleMap(diskSkills()), []);
});

test("validateRoleMap: names the three defect classes", () => {
  // a mapped skill missing from disk — synthetic disk, so every real map name is a ghost
  const ghost = validateRoleMap(["alpha", "beta"]);
  assert.ok(
    ghost.some((f) => f === 'roles map: "brainstorm" is assigned to analyst but skills/brainstorm/SKILL.md does not exist'),
  );
  // a disk skill assigned nowhere — the real tree plus one stranger
  const unassigned = validateRoleMap([...diskSkills(), "delta"]);
  assert.ok(
    unassigned.some((f) => f === "roles map: skills/delta is not assigned — add it to scripts/roles.mjs"),
  );
  // one skill in two roles — the map is module state: mutate, assert, restore
  ROLE_MAP.roles.qa.push("lazy");
  try {
    const doubled = validateRoleMap(diskSkills());
    assert.ok(
      doubled.some((f) => f === 'roles map: "lazy" is assigned to both dev and qa'),
    );
  } finally {
    ROLE_MAP.roles.qa.pop();
  }
});

test("pluginSkills: the role's skills in cycle order + shared; unknown role → null", () => {
  for (const role of roleNames()) {
    const skills = pluginSkills(role);
    for (const shared of ROLE_MAP.shared) {
      assert.ok(skills.includes(shared), `${role}: shared "${shared}" rides along`);
    }
    assert.ok(skills.includes(`role-${role}`), `${role}: its own entry skill`);
    assert.deepEqual(skills.slice(-ROLE_MAP.shared.length), ROLE_MAP.shared, "shared appended last");
  }
  assert.equal(pluginSkills("nope"), null);
});

test("pluginSkills: no role ships another role's entry skill or its skills", () => {
  const shared = new Set(ROLE_MAP.shared);
  for (const role of roleNames()) {
    const mine = new Set(pluginSkills(role));
    for (const other of roleNames()) {
      if (other === role) continue;
      assert.ok(!mine.has(`role-${other}`), `${role} must not ship role-${other}`);
      for (const skill of pluginSkills(other)) {
        if (shared.has(skill)) continue;
        assert.ok(!mine.has(skill), `${role} must not ship ${skill} (${other}'s)`);
      }
    }
  }
});

test("roleOf: a role skill, a shared skill, and a third-party unknown", () => {
  assert.equal(roleOf("brainstorm"), "analyst");
  assert.equal(roleOf("bug-hunt"), "qa");
  assert.equal(roleOf("dispatch"), "shared");
  assert.equal(roleOf("some-other-skill"), null);
  assert.equal(knownSkills().includes("some-other-skill"), false);
});

test("rolePluginManifests: specialist-<role>, the version, skills path; the two host manifests are identical", () => {
  for (const role of roleNames()) {
    const m = rolePluginManifests(role, "9.9.9");
    assert.equal(m.claude.name, `specialist-${role}`);
    assert.equal(m.claude.version, "9.9.9");
    assert.equal(m.claude.skills, "./skills");
    assert.ok(m.claude.description.length > 0);
    assert.deepEqual(m.codex, m.claude);
  }
  assert.equal(rolePluginManifests("nope", "1.0.0"), null);
});
