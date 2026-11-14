#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Bash): the git-watch twin for Codex. Codex PostToolUse is
 * record-only — it cannot undo anything — so the staleness signal is delivered as
 * ONE `additionalContext` JSON line on stdout (multiple stdout JSON lines are not
 * reliably parsed), which Codex injects into the agent's context.
 *
 * Protocol: hook JSON on stdin; a signal = exit 0 with the PostToolUse JSON on stdout
 * ({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "…"}}).
 * Nothing stale, a non-git command, a missing artifact and any internal error are all
 * a silent exit 0 (fail-safe).
 */
import { treeChangingCommands } from "./git-watch-core.mjs";
import { touchedProjectDirs, watchSignal } from "./git-watch-host.mjs";
import { codexContext, readHookPayload } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  if (!/^bash$/i.test(String(payload?.tool_name || ""))) process.exit(0);
  const commands = treeChangingCommands(String(payload?.tool_input?.command || ""));
  if (!commands.length) process.exit(0);

  const cwd = String(payload?.cwd || process.cwd());
  for (const projectDir of touchedProjectDirs(commands, cwd)) {
    const message = watchSignal(projectDir);
    if (message) {
      console.log(codexContext("PostToolUse", message));
      break;
    }
  }
} catch {
  /* fail-safe: a signal must never break the workflow */
}
process.exit(0);
