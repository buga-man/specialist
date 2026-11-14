/**
 * skill-gate-core.mjs — shared logic for the skill-gate hook.
 *
 * The project's .spec-gate mode may be "fast" — then the full-pipeline stage skills
 * (brainstorm, system-thinking, decompositor) are blocked from autonomous runs: the
 * user can still run them explicitly (the block message says how). Every other mode
 * allows everything.
 *
 * Fail-safe: unknown skill names and unknown shapes read as "allow" on the caller's
 * side — the gate never blocks what it cannot recognize.
 */

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

/** Decide whether invoking a skill is allowed in the given .spec-gate mode.
 *  Returns { action: "allow" } or { action: "block", reason }.
 *  Blocks only in mode "fast" and only for STAGE_SKILLS. */
export function decide({ mode, skill }) {
  const name = normalizeSkillName(skill);
  if (mode !== "fast" || !STAGE_SKILLS.includes(name)) return { action: "allow" };
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
