#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook: after Edit/Write/MultiEdit, runs the project's own
 * linter (eslint for web files when package.json declares it, ruff check for Python,
 * ktlint for Kotlin) on the edited file.
 * Auto-fixes what it can (--fix); remaining violations → exit 2 with the linter output
 * so the agent repairs the file immediately.
 * No project linter / non-code file / linter trouble / any internal error → exit 0
 * silently (fail-safe).
 */
import { lintFile } from "./lint-core.mjs";
import { readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const tool = String(payload?.tool_name || "");
  if (/^(Edit|Write|MultiEdit)$/i.test(tool)) {
    const filePath = String(payload?.tool_input?.file_path || "");
    if (filePath) {
      const result = await lintFile({ projectDir: resolveProjectDir(payload), filePath, run });
      if (result && !result.ok) {
        console.error(
          `lint-guard (${result.tool}) reports violations in ${filePath} — fix the errors:\n` +
            result.output,
        );
        process.exit(2);
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
