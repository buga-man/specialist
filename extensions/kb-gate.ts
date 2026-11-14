/**
 * kb-gate — pi extension, twin of the Claude Code Stop hook (hooks/lib/kb-gate.mjs).
 *
 * Keeps the documentation index in sync with the disk: when a run settles and the
 * index in .kbindex/ diverges from the markdown corpus, the gate surfaces the same
 * message the Claude Code Stop gate produces ("kb-index: documentation index is stale
 * (...). Rebuild it: node "<KB_CLI>" build --project "<dir>""). The reconcile is
 * kb-gate-core.mjs — the same verdict the Codex gate and the git-watch signal use.
 *
 * How the signal reaches the agent: the agent_settled event itself is final and
 * notification-only — a handler result is not read there. What the docs do guarantee
 * is the message push: work requested from agent_settled is deferred until every
 * settled handler finishes, and pi.sendMessage(..., { triggerTurn: true }) on an idle
 * session starts a continuation run that receives the message — the pi analog of the
 * Claude Code Stop block (exit 2 forces the agent to continue). The settle that
 * follows such a forced continuation is skipped (the analog of the Stop hook's
 * stop_hook_active), so the gate forces exactly one continuation per settle and can
 * never loop; an aborted run (Escape) is never continued.
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

export default function (pi: ExtensionAPI) {
  let continuing = false; // the settle right after a forced continuation is skipped
  pi.on("agent_settled", async (event, ctx) => {
    try {
      const skip = continuing || event.aborted === true;
      continuing = false;
      if (skip) return;

      const projectDir = resolveProjectDir(ctx.cwd);
      const staleness = indexStaleness(projectDir);
      if (!staleness) return; // no index, or the index matches the disk — leave alone

      const parts = [
        staleness.changed.length ? `changed: ${stalenessDetail(staleness.changed)}` : null,
        staleness.added.length ? `added: ${stalenessDetail(staleness.added)}` : null,
        staleness.missing.length ? `removed: ${stalenessDetail(staleness.missing)}` : null,
      ].filter(Boolean);
      await pi.sendMessage(
        {
          customType: "kb-gate",
          content:
            `kb-index: documentation index is stale (${parts.join("; ")}). ` +
            `Rebuild it: node "${KB_CLI}" build --project "${projectDir}"`,
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
