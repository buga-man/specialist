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
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;
      const command = String((event.input as { command?: string } | undefined)?.command || "");
      if (!command) return;
      // The same project-dir resolution as the other extensions and the Claude
      // Code adapters (no host-declared project variable on pi): a session
      // opened in a subdirectory still reads the root's .vuln-guard mode.
      const projectDir = gitRoot(ctx.cwd) || ctx.cwd;
      const result = await checkGitCommit({
        projectDir,
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
