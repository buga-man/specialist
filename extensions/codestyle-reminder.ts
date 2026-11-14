/**
 * codestyle-reminder — pi extension, twin of the Claude Code SessionStart hook
 * (hooks/lib/codestyle-reminder.mjs).
 *
 * One line of context when CODESTYLE.md may be stale: N code commits / days since the
 * frontmatter base, pushed as a persistent session message on session start. The
 * verdict comes from codestyleState() (git-watch-host.mjs) — the same computation the
 * git-watch signal uses; the line is reminderLine() (codestyle-core.mjs) — the same
 * line the Claude Code hook injects. The decision to rebuild belongs to the user, so
 * the reminder never blocks.
 *
 * Mechanism: plan-context injects by returning a message from before_agent_start;
 * session_start has no such return value, so the reminder is stored with
 * pi.sendMessage() without triggerTurn — an idle session stores it as a persistent
 * custom message (participates in the LLM context) without starting a turn, i.e. the
 * same session-entry mechanism plan-context's return value feeds.
 *
 * Boundaries: reason "reload" is skipped — the same session continues and already
 * carries the reminder; pi has no post-compaction session_start reason, so the
 * reminder is not re-sent after compaction (the Claude Code SessionStart matcher
 * includes compact — a documented boundary). Project dir: the resolveProjectDir chain
 * without the host env variable — the git root of the session cwd, else the cwd.
 *
 * Silent: without a document, on a broken document, when git cannot answer and on
 * any internal error (fail-safe — a reminder must never break the session).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { reminderLine } from "../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { codestyleState } from "../hooks/lib/git-watch-host.mjs";
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

/** The project directory of a session: the git root of the cwd, else the cwd. */
function resolveProjectDir(cwd: string): string {
  return gitRoot(cwd) || cwd;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    try {
      if (event.reason === "reload") return;
      const verdict = codestyleState(resolveProjectDir(ctx.cwd));
      if (!verdict) return;
      await pi.sendMessage({
        customType: "codestyle-reminder",
        content: reminderLine(verdict),
        display: true,
      });
    } catch {
      /* fail-safe: a reminder must never break the session */
    }
  });
}
