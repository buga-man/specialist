/**
 * roles.mjs — the single source of truth for the role split of the specialist
 * framework: which skill ships in which role plugin, and what the generated
 * plugin manifests say. Consumers:
 *   - scripts/compliance.mjs — validates the map against skills/ on disk and
 *     regenerates the committed roles/ trees with --fix;
 *   - scripts/copy-skills.sh --role <role> — takes the skill list from this CLI;
 *   - hooks/lib/skill-gate-core.mjs — the `role:` profile of .spec-gate decides
 *     out-of-role blocks from the same map (no second list to drift).
 *
 * Pure data and pure functions only — no I/O here (the house rule for cores).
 * CLI: node scripts/roles.mjs <role> — prints the plugin's skill names, one per
 * line; no argument prints usage. Exit codes: 0 — listed, 2 — unknown role.
 */

/** The role → skills map. A role list is also its working-cycle order (docs and
 *  the generated README show it). Every skill from skills/ must appear exactly
 *  once — in one role or in shared (compliance enforces it). `shared` ships in
 *  every role plugin and in the full bundle: the router must be present exactly
 *  wherever the framework is. */
export const ROLE_MAP = {
  roles: {
    analyst: [
      "brainstorm",
      "system-thinking",
      "decompositor",
      "kb-index",
      "tech-writer",
      "trace-audit",
      "role-analyst",
    ],
    dev: [
      "implementation-plan",
      "spec-implementation",
      "codestyle",
      "lazy",
      "root-cause",
      "role-dev",
    ],
    qa: ["spec-review", "stand-acceptance", "code-review", "bug-hunt", "role-qa"],
  },
  shared: ["dispatch", "bootstrap"],
};

/** The marketplace/plugin manifest description of each role plugin. Also the
 *  mission line of the generated roles/<role>/README.md. */
export const ROLE_DESCRIPTIONS = {
  analyst:
    "The analyst role of the specialist framework — a raw task to business, system, and " +
    "per-repository specs, and documentation that stays true to the code. Skills-only " +
    "plugin; the guards ship with the full specialist bundle.",
  dev:
    "The developer role of the specialist framework — a repo spec to spec-driven code: " +
    "implementation plans, tests-first minimal implementation, conventions, bug " +
    "root-causing. Skills-only plugin; the guards ship with the full specialist bundle.",
  qa:
    "The QA/reviewer role of the specialist framework — acceptance against the specs, " +
    "live-stand acceptance, quality review, adversarial bug and security hunting. " +
    "Skills-only plugin; the guards ship with the full specialist bundle.",
};

/** The role names, in map order. */
export function roleNames() {
  return Object.keys(ROLE_MAP.roles);
}

/** The skill names a role plugin ships (its role skills in cycle order + shared),
 *  or null for an unknown role. */
export function pluginSkills(role) {
  const list = ROLE_MAP.roles[role];
  if (!list) return null;
  return [...list, ...ROLE_MAP.shared];
}

/** Every specialist skill name the map knows (roles + shared), sorted. */
export function knownSkills() {
  return [...new Set([...Object.values(ROLE_MAP.roles).flat(), ...ROLE_MAP.shared])].sort();
}

/** Where a skill is assigned — a role name, "shared", or null for a skill the map
 *  does not know (a third-party skill: the role gate lets it through). */
export function roleOf(skill) {
  for (const [role, list] of Object.entries(ROLE_MAP.roles)) {
    if (list.includes(skill)) return role;
  }
  if (ROLE_MAP.shared.includes(skill)) return "shared";
  return null;
}

/** Map validation against the on-disk skill list: every disk skill assigned
 *  exactly once (a role or shared), every mapped skill present on disk.
 *  Returns findings — [] when the map is sound. */
export function validateRoleMap(diskSkillNames) {
  const findings = [];
  const disk = new Set(diskSkillNames);
  const assignment = new Map();
  for (const [where, list] of [
    ...Object.entries(ROLE_MAP.roles),
    ["shared", ROLE_MAP.shared],
  ]) {
    for (const skill of list) {
      const count = assignment.get(skill);
      if (count) {
        findings.push(`roles map: "${skill}" is assigned to both ${count} and ${where}`);
      } else {
        assignment.set(skill, where);
      }
      if (!disk.has(skill)) {
        findings.push(`roles map: "${skill}" is assigned to ${where} but skills/${skill}/SKILL.md does not exist`);
      }
    }
  }
  for (const skill of disk) {
    if (!assignment.has(skill)) {
      findings.push(`roles map: skills/${skill} is not assigned — add it to scripts/roles.mjs`);
    }
  }
  return findings;
}

/** The plugin manifest objects of a role plugin: `.claude-plugin/plugin.json`
 *  (Claude Code and ZCode read the marketplace source dir) and the root
 *  `plugin.json` (Codex) — identical content, roles carry no hooks. Null for an
 *  unknown role. */
export function rolePluginManifests(role, version) {
  const description = ROLE_DESCRIPTIONS[role];
  if (!description) return null;
  const manifest = {
    name: `specialist-${role}`,
    description,
    version,
    author: { name: "Specialist" },
    skills: "./skills",
  };
  return { claude: manifest, codex: manifest };
}

// The module runs both as an import and as a CLI — the listing only when executed.
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/roles.mjs")) {
  const role = process.argv[2];
  const skills = role ? pluginSkills(role) : null;
  if (!skills) {
    process.stdout.write(
      Buffer.from(
        "usage: node scripts/roles.mjs <role>\n" +
          `  <role>  one of: ${roleNames().join(", ")} — prints the plugin's skill names\n`,
        "utf8",
      ),
    );
    process.exit(2);
  }
  process.stdout.write(Buffer.from(skills.join("\n") + "\n", "utf8"));
}
