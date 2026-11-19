#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash): `git commit` → run the project's test command
 * from `.suite-gate`; a non-zero exit blocks the commit (exit 2, reason on stderr).
 * Opt-in: without a `.suite-gate` file the hook is silent.
 * No staged changes / green suite / spawn error / timeout / any internal error →
 * exit 0 silently (fail-safe: the hook never blocks legitimate work).
 *
 * Naming reminder: a hook file never starts with "test-" — npm test runs node --test
 * over hooks/ and would adopt it as a test file (docs/plugin-schema-notes.md).
 */
import { checkGitCommit } from "./suite-core.mjs";
import { readHookPayload, resolveProjectDir, run, runShell } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const tool = String(payload?.tool_name || "");
  if (/^bash$/i.test(tool)) {
    const command = String(payload?.tool_input?.command || "");
    if (command) {
      const result = await checkGitCommit({
        projectDir: resolveProjectDir(payload),
        command,
        run,
        runShell,
      });
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
