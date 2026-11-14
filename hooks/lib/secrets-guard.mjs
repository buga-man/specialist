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
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkGitCommand } from "./secrets-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const tool = String(payload?.tool_name || "");
  if (/^bash$/i.test(tool)) {
    const command = String(payload?.tool_input?.command || "");
    if (command) {
      const projectDir = String(payload?.cwd || process.cwd());
      const run = (cmd, args, opts) => {
        const r = spawnSync(cmd, args, { ...opts, encoding: "utf8", windowsHide: true });
        return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      };
      const result = await checkGitCommand({ projectDir, command, run });
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
