/**
 * skill-gate-core.mjs — shared logic for the skill-gate hook.
 *
 * Two .spec-gate profiles gate Skill calls here:
 *   - mode "fast" — the full-pipeline stage skills (brainstorm, system-thinking,
 *     decompositor) are blocked from autonomous runs: the block message says how to
 *     run the fast lane instead (the user can still invoke them explicitly);
 *   - role <analyst|dev|qa> — the session is pinned to one role plugin: the other
 *     roles' skills are blocked until the user consents to a switch (the message
 *     points to the dispatch protocol). Always allowed: the active role's skills,
 *     `dispatch` (shared, rides in every plugin), every `role-*` entry skill —
 *     switching roles means loading the new role's entry — and skills the roles map
 *     does not know (third-party: not ours to gate).
 *
 * The role lists come from scripts/roles.mjs — the same map the role plugins are
 * generated from; there is no second list to drift.
 *
 * Fail-safe: unknown skill names, unknown roles, and unknown shapes read as "allow"
 * on the caller's side — the gate never blocks what it cannot recognize.
 */
import { roleNames, roleOf } from "../../scripts/roles.mjs";

/** The full-pipeline stage skills that the "fast" SDD profile gates. */
export const STAGE_SKILLS = ["brainstorm", "system-thinking", "decompositor"];

/** Normalizes a raw skill name from a tool input: trims, strips a leading "/",
 *  takes the part after the last ":" (plugin:skill), lowercases. */
export function normalizeSkillName(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^\//, "");
  const i = s.lastIndexOf(":");
  if (i !== -1) s = s.slice(i + 1);
  return s.toLowerCase();
}

/** The `role-*` entry skills — always allowed: switching roles is loading the new
 *  role's entry skill, with the user's consent from the dispatch protocol. */
const ROLE_ENTRY_RE = /^role-/;

/** Decide whether invoking a skill is allowed under the given .spec-gate profiles.
 *  Returns { action: "allow" } or { action: "block", reason }.
 *  "fast" blocks STAGE_SKILLS (checked first — the fast lane is the small-task
 *  profile regardless of role); a pinned role blocks every other role's skills. */
export function decide({ mode, role, skill }) {
  const name = normalizeSkillName(skill);
  if (mode === "fast" && STAGE_SKILLS.includes(name)) {
    return {
      action: "block",
      reason:
        `skill-gate: "${name}" is a full-pipeline stage and this project runs the ` +
        "`fast` SDD profile (.spec-gate). For a small task use the fast lane: write a " +
        "mini-spec (what and why, 1-3 verifiable acceptance criteria) into the header of a " +
        "one-task plan in docs/plans/, then execute it (spec-implementation). If the user " +
        "explicitly asked for this stage, ask them to set .spec-gate to `soft` for the run — " +
        "with no open plan you may edit the file yourself; restore `fast` afterwards.",
    };
  }
  const pinned = role && roleNames().includes(role) ? role : null;
  if (pinned) {
    const home = roleOf(name);
    if (home && home !== "shared" && home !== pinned && !ROLE_ENTRY_RE.test(name)) {
      return {
        action: "block",
        reason:
          `skill-gate: "${name}" belongs to the ${home} role, but .spec-gate pins ` +
          `role: ${pinned}. Switching roles needs the user's explicit consent — offer ` +
          `the dispatch options (switch here / a new session with that role / a role ` +
          `subagent / stay and record the task for the other role). If the user agrees ` +
          `to switch here, update .spec-gate to role: ${home}.`,
      };
    }
  }
  return { action: "allow" };
}
