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
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { lintFile } from "./lint-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const tool = String(payload?.tool_name || "");
  if (/^(Edit|Write|MultiEdit)$/i.test(tool)) {
    const filePath = String(payload?.tool_input?.file_path || "");
    if (filePath) {
      const projectDir = String(payload?.cwd || process.cwd());
      const run = (cmd, args, opts) => {
        const r = spawnSync(cmd, args, { ...opts, encoding: "utf8", windowsHide: true });
        return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      };
      const result = await lintFile({ projectDir, filePath, run });
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
