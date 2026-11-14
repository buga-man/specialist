/**
 * vuln-guard — pi extension, twin of the Claude Code hook (hooks/lib/vuln-guard.mjs).
 *
 * `git commit` → semgrep scan of the staged files, findings block the tool call. The
 * per-edit opt-in scan (".vuln-guard = always") lives in edit-guard.ts — one
 * tool_result extension with the formatter and the linter, in a deterministic order.
 * No semgrep on PATH, clean scan, broken scanner → pass-through (fail-safe).
 */
import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkGitCommit } from "../hooks/lib/vuln-core.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;
      const command = String((event.input as { command?: string } | undefined)?.command || "");
      if (!command) return;
      const result = await checkGitCommit({
        projectDir: ctx.cwd,
        command,
        run: (cmd, args, opts) => pi.exec(cmd, args, opts),
      });
      if (result) {
        return { block: true, reason: result.reason };
      }
    } catch {
      /* fail-safe: never block on hook errors */
    }
  });
}
