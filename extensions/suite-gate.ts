/**
 * suite-gate — pi extension, twin of the Claude Code hook (hooks/lib/suite-gate.mjs).
 *
 * `git commit` → the project's test command from `.suite-gate` (first line is the
 * command); a non-zero exit blocks the tool call. Opt-in: no file, empty, or "off" —
 * pass-through. No staged changes / green suite / spawn error / timeout → pass-through
 * (fail-safe: the hook never blocks legitimate work).
 */
import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkGitCommit } from "../hooks/lib/suite-core.mjs";
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return;
      const command = String((event.input as { command?: string } | undefined)?.command || "");
      if (!command) return;
      // The session cwd may be a subdirectory, .suite-gate lives at the repository root —
      // the same resolution as spec-gate.ts (no host-declared project variable on pi).
      const projectDir = gitRoot(ctx.cwd) || ctx.cwd;
      // The .suite-gate line is a shell command line, not argv — the platform shell
      // sorts out quoting and `&&`; pi.exec stays the spawn channel.
      const runShell = (line: string, opts: Record<string, unknown>) =>
        process.platform === "win32"
          ? pi.exec("cmd.exe", ["/d", "/s", "/c", line], opts)
          : pi.exec("/bin/sh", ["-c", line], opts);
      const result = await checkGitCommit({
        projectDir,
        command,
        run: (cmd, args, opts) => pi.exec(cmd, args, opts),
        runShell,
      });
      if (result) {
        return { block: true, reason: result.reason };
      }
    } catch {
      /* fail-safe: never block on hook errors */
    }
  });
}
