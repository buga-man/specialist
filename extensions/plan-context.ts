/**
 * plan-context — pi extension, twin of the Claude Code hook (hooks/lib/plan-context.mjs).
 *
 * Injects a short orientation block (active plan, open tasks, spec-gate state) as a
 * persistent session message on the first user prompt of a session — the goal is that
 * the agent never edits against a plan it does not know about. Silent when there is
 * nothing to say (no open plan, gate off); fail-safe by construction.
 *
 * Compaction: compaction wipes the session entries, the injected orientation included —
 * the session_compact event resets the injected flag so the first user prompt after
 * compaction re-injects it. session_compact (not session_before_compact) because it
 * fires only when the compaction was actually saved; a cancelled or failed compaction
 * leaves the context intact and must not re-inject.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildPlanContext } from "../hooks/lib/plan-context-core.mjs";
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

export default function (pi: ExtensionAPI) {
  let injected = false;
  pi.on("before_agent_start", async (event, ctx) => {
    try {
      if (injected || event.messageType !== "user") return;
      // The git root of the session cwd, else the cwd — the plan lives at the root, and
      // a session opened in a subdirectory must still be oriented (the same resolution
      // as spec-gate.ts and kb-gate.ts).
      const text = buildPlanContext(gitRoot(ctx.cwd) || ctx.cwd);
      if (!text) return; // no plan (yet) — stay quiet and check again on the next run
      injected = true; // one persistent message per session, never repeated
      return { message: { customType: "plan-context", content: text, display: true } };
    } catch {
      /* fail-safe: orientation must never break the session */
    }
  });

  pi.on("session_compact", async () => {
    try {
      injected = false; // the context was wiped — re-orient on the next user prompt
    } catch {
      /* fail-safe: orientation must never break the session */
    }
  });
}
