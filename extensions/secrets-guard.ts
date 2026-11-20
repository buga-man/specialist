/**
 * secrets-guard — pi extension, twin of the Claude Code hook (hooks/lib/secrets-guard.mjs).
 *
 * Blocks `git add` of sensitive files, `git commit` with secrets in the staged diff and
 * `git push` with secrets in the outgoing diff. Findings can be legitimate fixtures —
 * allowlist them as regex lines in .secrets-allow (project root) and repeat the command.
 * Non-git commands and any internal error are pass-through (fail-safe).
 */
import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkGitCommand } from "../hooks/lib/secrets-core.mjs";
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;
      const command = String((event.input as { command?: string } | undefined)?.command || "");
      if (!command) return;
      // The same project-dir resolution as the other extensions and the Claude
      // Code adapters (no host-declared project variable on pi): a session
      // opened in a subdirectory still finds the root's .secrets-allow.
      const projectDir = gitRoot(ctx.cwd) || ctx.cwd;
      const result = await checkGitCommand({
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
