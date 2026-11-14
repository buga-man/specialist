/**
 * git-watch — pi extension, twin of the Claude Code PostToolUse hook
 * (hooks/lib/git-watch.mjs).
 *
 * After a successful bash tool call that ran a tree-changing git operation (commit,
 * checkout/switch, merge, rebase, pull, reset, cherry-pick, stash pop/apply) the
 * derived support artifacts of the touched project may have gone stale — the tree
 * changed underneath the agent, not by its edits. The command parser is
 * treeChangingCommands() (git-watch-core.mjs); the verdict is touchedProjectDirs() +
 * watchSignal() (git-watch-host.mjs) — the same signal the Claude Code and Codex
 * adapters deliver. The signal text is appended to the tool result the way vuln-guard
 * appends its scan results, but without flagging an error: the git command itself
 * succeeded. The index is rebuilt by the agent on its own (derived data; the kb-gate
 * would demand it anyway); CODESTYLE.md is committed content — the agent asks the
 * user before touching it. Neither is ever updated silently.
 *
 * A failed tool call (event.isError, the way format-guard checks it), a non-bash call,
 * a non-git command, nothing stale and any internal error are all pass-through
 * (fail-safe). Git run by the user outside the agent is invisible until the next
 * session start or settle check — a documented boundary, like the Bash boundary of
 * spec-gate.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { treeChangingCommands } from "../hooks/lib/git-watch-core.mjs";
import { touchedProjectDirs, watchSignal } from "../hooks/lib/git-watch-host.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    try {
      if (event.toolName !== "bash") return;
      if (event.isError) return;
      const command = String((event.input as { command?: string } | undefined)?.command || "");
      const commands = treeChangingCommands(command);
      if (!commands.length) return;

      for (const projectDir of touchedProjectDirs(commands, ctx.cwd)) {
        const signal = watchSignal(projectDir);
        if (signal) {
          const text = (event.content ?? [])
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("\n");
          return { content: [{ type: "text", text: `${text}\n\n${signal}` }] };
        }
      }
    } catch {
      /* fail-safe: a signal must never break the workflow */
    }
  });
}
