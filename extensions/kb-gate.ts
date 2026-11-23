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
 *   to the agent as the continuation instruction; it never fires for task/subagent
 *   sessions, and an operator interrupt overrides a refusal.
 *
 * In both wirings the settle that follows a forced continuation is skipped (the
 * analog of the Stop hook's stop_hook_active), so the gate forces exactly one
 * continuation per settle and can never loop; an aborted run (pi carries `aborted`
 * on agent_settled) is never continued.
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
  let continuing = false; // the settle right after a forced continuation is skipped

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
          event: unknown,
          ctx: { cwd: string },
        ) => { decision: "block"; reason: string } | undefined,
      ): void;
    };
    omp.on("session_stop", async (_event, ctx) => {
      try {
        const skip = continuing;
        continuing = false;
        if (skip) return;

        const projectDir = resolveProjectDir(ctx.cwd);
        const message = staleMessage(projectDir);
        if (!message) return;

        continuing = true; // one forced continuation per settle — never a loop
        return { decision: "block", reason: message };
      } catch {
        /* fail-safe: never block on gate errors */
      }
    });
    return;
  }

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
