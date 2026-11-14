#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook: blocks Edit/Write/MultiEdit/NotebookEdit calls that fall
 * outside the scope of the open plan (docs/plans/) — the scope-enforcement gate.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code feeds it back to the agent), allow = exit 0 silently.
 * Any internal error → exit 0 (fail-safe: the hook never blocks legitimate work).
 */
import { readFileSync } from "node:fs";
import { decide, readMode } from "./spec-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const tool = String(payload?.tool_name || "");
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/i.test(tool)) {
    const input = payload?.tool_input || {};
    const filePath = String(input.file_path || input.notebook_path || "");
    if (filePath) {
      const projectDir = String(payload?.cwd || process.cwd());
      const result = decide({ projectDir, filePath, mode: readMode(projectDir) });
      if (result.action === "block") {
        console.error(result.reason);
        process.exit(2);
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
