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
 * switched off. Three process rules carry context that must survive even before any
 * plan exists, so they are injected with no open tasks too:
 *   - the "fast" SDD profile (its stage skills and lane rules);
 *   - the onboarding reminder: a project that opted into the SDD discipline (a
 *     .spec-gate file in any mode but "off") is expected to carry CODESTYLE.md and a
 *     built documentation index — missing pieces get one line. Absence is unfinished
 *     onboarding, not an error, so the reminder never blocks and never fires in
 *     projects without the marker;
 *   - the spec-chain resume pointer (below). Unlike the onboarding reminder it needs
 *     no marker: a docs/specs/ tree is itself the opt-in signal — the project is
 *     mid-pipeline by definition, and the line only names where it stopped.
 * The block must stay small (a few lines) — it enters the context of every session.
 *
 * The third orientation source: the spec chain. When a
 * feature chain (docs/specs/, one slug per feature) stopped mid-pipeline — a business
 * spec without a system spec, repo specs without plans, executed plans without a
 * review — the newest such chain gets one line naming the stage and the skill to
 * resume with. Everything it needs is derived from the tree: the slug dates in the
 * file names, the `status:` field the specs already carry, the open tasks of plans.
 * No handoff state file exists and none may: agent edits and a `git pull` are
 * indistinguishable to a file (the repository's own anti-pattern), so the pointer is
 * recomputed from disk on every session start. Skipped while a plan has open tasks —
 * the plan orientation is the then-current signal.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

// Case-insensitive on the suffix on purpose: the filter above accepts ".MD", and a
// Windows filesystem makes the uppercase variant a real occurrence.
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/i;

/** Dated markdown artifacts of one directory (specs and plans carry the date in the
 *  slug). Any read error — an empty list; the chain line is a nice-to-have. */
function listDated(dir) {
  let files = [];
  try {
    if (!existsSync(dir)) return [];
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const m = f.match(DATE_PREFIX);
    if (m) out.push({ date: m[1], rest: m[2], file: f });
  }
  return out;
}

/** The `status:` field of a spec's frontmatter, or null. Lenient on purpose: the
 *  strictness bar applies to gates, not to an orientation line. */
function specStatus(path) {
  try {
    const head = readFileSync(path, "utf8").split(/^---$/m, 3);
    const block = head.length >= 3 ? head[1] : "";
    const m = block.match(/^status:[ \t]*([A-Za-z-]+)/m);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The spec-chain resume pointer, or null: every chain complete, no docs/specs at all,
 * or nothing parsable. Per topic (the business spec's slug) the stage is the first
 * missing artifact kind in pipeline order — business → system → repo specs → plans →
 * reviews; a chain with any review counts as complete (a partially reviewed multi-repo
 * topic is a residual: the plan orientation and spec-review's own traceability pass
 * still cover it). Draft status at the frontier means approval is the actual next step,
 * not the next skill. Only the newest incomplete chain is reported — one line, and a
 * session opens on the current work, not on every abandoned sketch.
 */
export function specChainBlock(projectDir) {
  const specsDir = join(projectDir, "docs", "specs");
  const specs = listDated(specsDir);
  if (!specs.length) return null;
  const plans = listDated(join(projectDir, "docs", "plans"));

  // Topic grouping from file names alone is ambiguous: `dark-mode-api` may be the api
  // repo spec of "dark-mode" or its own business topic. The pipeline resolves it: a
  // repo spec never has a system spec of its own, and its putative parent does —
  // decompositor runs on a system spec, and a file with a chain of its own is that
  // chain's head, not someone's repo spec.
  const hasSystem = (T) => specs.some((s) => s.rest === `${T}-implementation`);
  const suffixed = (s) => s.rest.endsWith("-review") || s.rest.endsWith("-implementation");
  const candidates = specs.filter((s) => !suffixed(s));
  const isRepoSpec = (R) =>
    !hasSystem(R) &&
    candidates.some((c) => c.rest !== R && R.startsWith(`${c.rest}-`) && hasSystem(c.rest));
  const topics = candidates.filter((c) => !isRepoSpec(c.rest));

  let newest = null; // { date, line }
  for (const b of topics) {
    const T = b.rest;
    const reviewed = specs.some(
      (s) => s.rest.startsWith(`${T}-`) && s.rest.endsWith("-review"),
    );
    if (reviewed) continue; // reviewed — the chain is done
    const sys = specs.find((s) => s.rest === `${T}-implementation`);
    const repos = specs.filter(
      (s) =>
        s.rest.startsWith(`${T}-`) &&
        s.rest !== `${T}-implementation` &&
        !s.rest.endsWith("-review") &&
        isRepoSpec(s.rest),
    );
    const topicPlans = plans.filter((p) => p.rest.startsWith(`${T}-`) && !p.rest.endsWith("-quick"));

    let line;
    if (!sys) {
      const status = specStatus(join(specsDir, b.file));
      line =
        status === "draft"
          ? 'business spec is a draft — finish it and get the user\'s approval, then system-thinking'
          : "business spec approved — next: system-thinking (system analysis)";
    } else if (!repos.length) {
      const status = specStatus(join(specsDir, sys.file));
      line =
        status === "draft"
          ? "system spec is a draft — get approval, then decompositor"
          : "system spec ready — next: decompositor (per-repo specs)";
    } else if (!topicPlans.length) {
      line = `${repos.length} repo spec(s) ready — next: implementation-plan (task plans)`;
    } else if (topicPlans.length < repos.length) {
      line = `plans cover ${topicPlans.length}/${repos.length} repo spec(s) — continue with implementation-plan`;
    } else {
      line = "plan(s) executed — next: spec-review (acceptance)";
    }
    const entry = { date: b.date, line: `spec-chain "${T}": ${line}.` };
    if (!newest || entry.date > newest.date) newest = entry;
  }
  return newest ? newest.line : null;
}

/**
 * Returns the context block, or null when there is nothing to inject.
 *
 * - off: always null (silent).
 * - soft/hard: the plan orientation (open tasks, gate state, closing contract) — only
 *   when there are open tasks; with no open tasks: the spec-chain line (no marker
 *   needed — a docs/specs/ tree is the opt-in), else the onboarding line when the
 *   project opted in via .spec-gate, otherwise null.
 * - fast: with an open plan the usual orientation (with the soft file-gate wording,
 *   since fast is soft for files) plus the fast-profile block; with no open tasks the
 *   fast-profile block plus the chain line — the process orientation is needed before
 *   any plan exists.
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
      // No open tasks — the spec chain takes over as the orientation: a mid-flight
      // chain is the thing a fresh session would otherwise not know to continue.
      const chain = specChainBlock(projectDir);
      if (mode === "fast") {
        return withOnboarding(chain ? `${FAST_PROFILE_BLOCK}\n${chain}` : FAST_PROFILE_BLOCK);
      }
      if (!chain) return onboarding;
      return withOnboarding(chain);
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
