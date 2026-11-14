#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook (Bash): signals the agent when a tree-changing git
 * operation (commit, checkout/switch, merge, rebase, pull, reset, cherry-pick, stash
 * pop/apply) has left the derived support artifacts stale.
 *
 * The tree changed underneath the agent, not by its edits — the hook evaluates both
 * artifacts statelessly (against the disk, so the source of the change does not
 * matter): the documentation index is rebuilt on the agent's own (derived data; the
 * Stop gate would demand it anyway), the codestyle document is committed content —
 * the agent must ask the user before touching it. Neither is ever updated silently.
 *
 * Protocol: hook JSON on stdin; a signal = exit 2 with the message on stderr (Claude
 * Code feeds PostToolUse stderr to the agent). Nothing stale, a non-git command, a
 * missing artifact and any internal error are all exit 0 (fail-safe).
 * Git run by the user outside the agent is invisible here — the next SessionStart /
 * Stop checks cover it (documented boundary).
 */
import { treeChangingCommands } from "./git-watch-core.mjs";
import { touchedProjectDirs, watchSignal } from "./git-watch-host.mjs";
import { readHookPayload } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  if (payload?.tool_name !== "Bash") process.exit(0);
  const commands = treeChangingCommands(String(payload?.tool_input?.command || ""));
  if (!commands.length) process.exit(0);

  const cwd = String(payload?.cwd || process.cwd());
  for (const projectDir of touchedProjectDirs(commands, cwd)) {
    const message = watchSignal(projectDir);
    if (message) {
      console.error(message);
      process.exit(2);
    }
  }
} catch {
  /* fail-safe: a signal must never break the workflow */
}
process.exit(0);
