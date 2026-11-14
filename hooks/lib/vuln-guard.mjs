#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash): `git commit` → semgrep scan of the staged files;
 * findings block the commit (exit 2, reason on stderr). The per-edit opt-in scan
 * ("always" mode) lives in edit-guard.mjs — one PostToolUse adapter with the formatter
 * and the linter, in a deterministic order.
 * No semgrep on PATH / clean scan / broken scanner / any internal error → exit 0
 * silently (fail-safe: the hook never blocks legitimate work).
 */
import { checkGitCommit } from "./vuln-core.mjs";
import { readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const tool = String(payload?.tool_name || "");
  if (/^bash$/i.test(tool)) {
    const command = String(payload?.tool_input?.command || "");
    if (command) {
      const result = await checkGitCommit({ projectDir: resolveProjectDir(payload), command, run });
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
