/**
 * kb-gate — extension for pi agent and oh-my-pi (omp), twin of the Claude Code Stop
 * hook (hooks/lib/kb-gate.mjs).
 *
 * Keeps the documentation index in sync with the disk: when a run settles and the
 * index in .kbindex/ diverges from the markdown corpus, the gate surfaces the same
 * message the Claude Code Stop gate produces ("kb-index: documentation index is stale
 * (...). Rebuild it: node "<KB_CLI>" build --project "<dir>""). The reconcile is
 * kb-gate-core.mjs — the same verdict the Codex gate and the git-watch signal use.
 *
 * The settle boundary is spelled differently per host (omp is a pi fork):
 *
 * - pi — agent_settled: the event itself is final and notification-only — a handler
 *   result is not read there. What the docs do guarantee is the message push: work
 *   requested from agent_settled is deferred until every settled handler finishes,
 *   and pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true }) on an idle
 *   session starts a continuation run that receives the message — the pi analog of
 *   the Claude Code Stop block (exit 2 forces the agent to continue).
 * - omp — session_stop: the main-session blocking stop hook (the Claude Stop twin).
 *   A `{ decision: "block", reason }` return refuses the settle and feeds the reason
 *   to the agent as the continuation instruction; the event carries `stop_hook_active`
 *   (omp names the fuse after the Claude flag) and the settle's abort `signal`; it
 *   never fires for task/subagent sessions, and an operator interrupt overrides a
 *   refusal.
 *
 * The per-host fuse: omp reads the event's `stop_hook_active` (true exactly on the
 * settle that follows a hook-forced continuation) and the abort `signal`; on top of
 * the host flag the omp wiring keeps a settle budget — up to two consecutive blocks
 * per chain (the first refusal plus one retry for the index rebuild), reset by a
 * clean settle or an abort, silence after — so the richest host fuse buys a bounded
 * retry, never a loop (omp's own continuation cap is 8, far above this fuse).
 * pi's agent_settled carries no such flag, so the pi wiring keeps its own latch —
 * the settle right after a forced continuation is skipped, and an aborted run
 * (`aborted` on the event) is never continued. Neither wiring can loop.
 *
 * Host detection: omp marks its ExtensionAPI with members pi does not carry
 * (registerLinkScheme and friends — any one hit decides). A future pi that grows
 * such a member would take the omp wiring and go inert there — fail-safe silence,
 * the gate's standing rule; the same happens on an omp that drops them all.
 *
 * Project dir: the resolveProjectDir chain without the host env variable — the git
 * root of the session cwd, else the cwd (a session opened in a subdirectory still
 * finds the repo-root .kbindex).
 *
 * A project without an index is left alone — nothing is created there.
 * Fail-safe: any internal error → silence (a gate error must never break the session).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { KB_CLI } from "../hooks/lib/hook-kit.mjs";
import { indexStaleness, stalenessDetail } from "../hooks/lib/kb-gate-core.mjs";
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

/** The project directory of a session: the git root of the cwd, else the cwd. */
function resolveProjectDir(cwd: string): string {
  return gitRoot(cwd) || cwd;
}

/** The members omp adds to its ExtensionAPI and pi does not carry — the probe set
 *  for the host fork below (any one hit marks the host as omp). */
const OMP_ONLY_MEMBERS = [
  "registerLinkScheme",
  "registerTodoBackend",
  "registerComposerShape",
  "registerFileWriteFallback",
  "registerTranscriptPresenter",
] as const;

/** The omp settle budget: consecutive blocks per continuation chain (the first
 *  refusal plus one retry for the index rebuild). A clean settle or an abort resets
 *  the chain; after the budget the gate goes silent — bounded, never a loop. */
const SETTLE_BUDGET = 2;

/** The stale-index verdict message, or null when there is no index or it matches
 *  the disk — the same text on every host. */
function staleMessage(projectDir: string): string | null {
  const staleness = indexStaleness(projectDir);
  if (!staleness) return null; // no index, or the index matches the disk — leave alone

  const parts = [
    staleness.changed.length ? `changed: ${stalenessDetail(staleness.changed)}` : null,
    staleness.added.length ? `added: ${stalenessDetail(staleness.added)}` : null,
    staleness.missing.length ? `removed: ${stalenessDetail(staleness.missing)}` : null,
  ].filter(Boolean);
  return (
    `kb-index: documentation index is stale (${parts.join("; ")}). ` +
    `Rebuild it: node "${KB_CLI}" build --project "${projectDir}"`
  );
}

export default function (pi: ExtensionAPI) {
  const isOmp = OMP_ONLY_MEMBERS.some(
    (member) => typeof (pi as unknown as Record<string, unknown>)[member] === "function",
  );

  if (isOmp) {
    // omp: the blocking stop hook. Typed locally — this repository deliberately does
    // not type-check against the omp SDK (the hosts own the types; check-extensions.mjs
    // checks imports and balance only).
    const omp = pi as ExtensionAPI & {
      on(
        name: "session_stop",
        handler: (
          event: { stop_hook_active: boolean; signal: AbortSignal },
          ctx: { cwd: string },
        ) => { decision: "block"; reason: string } | undefined,
      ): void;
    };
    let chainBlocks = 0; // consecutive blocks in the current continuation chain
    omp.on("session_stop", async (event, ctx) => {
      try {
        // The host's fuse and abort: stop_hook_active is true exactly on the settle
        // that follows a hook-forced continuation; an aborted settle is never gated
        // and ends the chain, a fresh settle (the flag false) starts a new one.
        if (event.signal.aborted) {
          chainBlocks = 0;
          return;
        }
        if (!event.stop_hook_active) chainBlocks = 0;
        else if (chainBlocks >= SETTLE_BUDGET) return; // budget spent — silence

        const projectDir = resolveProjectDir(ctx.cwd);
        const message = staleMessage(projectDir);
        if (!message) return;
        chainBlocks++;
        return { decision: "block", reason: message };
      } catch {
        /* fail-safe: never block on gate errors */
      }
    });
    return;
  }

  // pi: agent_settled is notification-only — the continuation is a triggerTurn
  // follow-up, and the latch is the fuse (the event carries no stop_hook_active).
  let continuing = false; // the settle right after a forced continuation is skipped
  pi.on("agent_settled", async (event, ctx) => {
    try {
      const skip = continuing || event.aborted === true;
      continuing = false;
      if (skip) return;

      const projectDir = resolveProjectDir(ctx.cwd);
      const message = staleMessage(projectDir);
      if (!message) return;

      await pi.sendMessage(
        {
          customType: "kb-gate",
          content: message,
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
      continuing = true; // one forced continuation per settle — never a loop
    } catch {
      /* fail-safe: never block on hook errors */
    }
  });
}
