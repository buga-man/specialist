/**
 * plan-context-core.mjs — shared logic for the plan-context hook.
 *
 * Builds a short orientation block for a fresh session: which plan is active, how many
 * tasks are open and which, what the spec-gate currently allows, and how a task is
 * closed. Injected once at session start (Claude Code SessionStart stdout / pi
 * before_agent_start persistent message) — the goal is that the agent never edits
 * against a plan it does not know about.
 *
 * Deliberately silent when there is nothing to say: no open tasks, or the gate is
 * switched off. Two exceptions carry process rules that must be in context even
 * before any plan exists, so they are injected with no open tasks too:
 *   - the "fast" SDD profile (its stage skills and lane rules);
 *   - the onboarding reminder: a project that opted into the SDD discipline (a
 *     .spec-gate file in any mode but "off") is expected to carry CODESTYLE.md and a
 *     built documentation index — missing pieces get one line. Absence is unfinished
 *     onboarding, not an error, so the reminder never blocks and never fires in
 *     projects without the marker.
 * The block must stay small (a few lines) — it enters the context of every session.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { activePlanInfo, readMode } from "./spec-core.mjs";

const MAX_TITLES = 5;
const MAX_TITLE_LEN = 80;

const clip = (s) => (s.length > MAX_TITLE_LEN ? s.slice(0, MAX_TITLE_LEN - 1) + "…" : s);

const FAST_PROFILE_BLOCK =
  "SDD profile `fast`: small tasks go through the fast lane — write a mini-spec (what and " +
  "why, 1-3 verifiable acceptance criteria) into the header of a one-task plan in " +
  "docs/plans/, execute it, close with `- Done:`. brainstorm / system-thinking / " +
  "decompositor run only on the user's explicit request (the skill-gate hook blocks " +
  "autonomous runs).";

/** The onboarding reminder, or null: with a .spec-gate marker (any mode but "off")
 *  the project is expected to carry CODESTYLE.md and a built documentation index;
 *  every missing piece is named with the skill that produces it. */
function onboardingBlock(projectDir) {
  if (!existsSync(join(projectDir, ".spec-gate"))) return null;
  if (readMode(projectDir) === "off") return null;
  const missing = [];
  if (!existsSync(join(projectDir, "CODESTYLE.md"))) {
    missing.push("no CODESTYLE.md — run the codestyle skill (generate mode)");
  }
  if (!existsSync(join(projectDir, ".kbindex", "index.json"))) {
    missing.push("no documentation index — run the kb-index skill (build)");
  }
  return missing.length ? `Onboarding: ${missing.join("; ")}.` : null;
}

/**
 * Returns the context block, or null when there is nothing to inject.
 *
 * - off: always null (silent).
 * - soft/hard: the plan orientation (open tasks, gate state, closing contract) — only
 *   when there are open tasks; with no open tasks: the onboarding line when the project
 *   opted in via .spec-gate, otherwise null.
 * - fast: with an open plan the usual orientation (with the soft file-gate wording,
 *   since fast is soft for files) plus the fast-profile block; with no open tasks the
 *   fast-profile block alone — the process orientation is needed before any plan exists.
 * - The onboarding line (when present) is appended in every non-off case.
 */
export function buildPlanContext(projectDir) {
  try {
    const mode = readMode(projectDir);
    if (mode === "off") return null;
    const onboarding = onboardingBlock(projectDir);
    const withOnboarding = (text) => (onboarding ? `${text}\n${onboarding}` : text);

    const info = activePlanInfo(projectDir);
    if (!info.hasOpenTasks) {
      if (mode === "fast") return withOnboarding(FAST_PROFILE_BLOCK);
      return onboarding;
    }

    const n = info.openTaskCount || info.openTaskTitles.length || 1;
    const titles = info.openTaskTitles.slice(0, MAX_TITLES).map(clip);
    const more = info.openTaskTitles.length > MAX_TITLES ? "; …" : "";
    const plans = info.openPlans.length ? ` (${info.openPlans.join(", ")})` : "";

    const gate =
      mode === "hard"
        ? "spec-gate (hard): code edits are blocked outside the plan — produce a plan first. " +
          'Docs (*.md, docs/**) stay editable. Only the user may change the mode via .spec-gate.'
        : "spec-gate (soft): while the plan is open, code edits must stay within the open tasks' " +
          'file lists ("- Files:"). Docs (*.md, docs/**) stay editable.';

    // Surfaced here because its only other symptom is every code edit blocking with
    // a "no backticked paths" reason — hard to diagnose from the block message alone.
    const unparsed = info.unparsedFiles
      ? 'spec-gate: an open task\'s "- Files:" line has no backticked paths — its scope is ' +
        "unparsable, so code edits block until the line names its files.\n"
      : "";
    const unbalanced = info.unbalancedFence
      ? "spec-gate: a plan in docs/plans/ ends inside a code fence (an unbalanced ``` marker) — " +
        "every task after it is invisible to the gate, and edits of its files block as out of " +
        "scope. Close the fence.\n"
      : "";

    const text =
      unparsed +
      unbalanced +
      `plan-context: ${n} open task(s) in docs/plans/${plans}:${titles.length ? `\n  - ${titles.join("\n  - ")}${more}` : ""}\n` +
      `${gate}\n` +
      'Close a task with an explicit "- Done: <commit>" line in the plan — "- [x]" checkboxes are progress, not closure.';

    return withOnboarding(mode === "fast" ? `${text}\n${FAST_PROFILE_BLOCK}` : text);
  } catch {
    return null; // fail-safe: orientation is a nice-to-have, never a burden
  }
}
