#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash): blocks `git add` of sensitive files, `git commit`
 * with secrets in the staged diff, and `git push` with secrets in the outgoing diff —
 * the points where a leak becomes git history.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code feeds it back to the agent), allow = exit 0 silently.
 * Non-git commands, allowlisted findings (.secrets-allow in the project root) and any
 * internal error → exit 0 (fail-safe: the hook never blocks legitimate work).
 */
import { checkGitCommand } from "./secrets-core.mjs";
import { readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const tool = String(payload?.tool_name || "");
  if (/^bash$/i.test(tool)) {
    const command = String(payload?.tool_input?.command || "");
    if (command) {
      const result = await checkGitCommand({ projectDir: resolveProjectDir(payload), command, run });
      if (result) {
        console.error(result.reason);
        process.exit(2);
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
