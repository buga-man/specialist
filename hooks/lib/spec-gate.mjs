#!/usr/bin/env node
/**
 * PreToolUse hook (Claude Code and Codex): blocks file-editing calls that fall outside
 * the scope of the open plan (docs/plans/) — the scope-enforcement gate.
 *
 * Payload shapes handled:
 *   - Claude Code Edit/Write/MultiEdit/NotebookEdit: tool_input.file_path / notebook_path.
 *   - Codex apply_patch: tool_input carries the whole patch text; every file the patch
 *     touches is checked, and the call is blocked if any target is outside the scope.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr (the host
 * feeds it back to the agent), allow = exit 0 silently.
 * Any internal error → exit 0 (fail-safe: the hook never blocks legitimate work).
 */
import { readFileSync } from "node:fs";
import { applyPatchPaths, decide, readMode } from "./spec-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const tool = String(payload?.tool_name || "");
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/i.test(tool)) {
    const input = payload?.tool_input || {};
    const projectDir = String(payload?.cwd || process.cwd());
    const mode = readMode(projectDir);
    const filePath = String(input.file_path || input.notebook_path || "");
    if (filePath) {
      const result = decide({ projectDir, filePath, mode });
      if (result.action === "block") {
        console.error(result.reason);
        process.exit(2);
      }
    } else {
      // No single target file — an apply_patch-style payload. Unknown shapes read as
      // null and stay silent; a recognizable patch is checked file by file.
      const patchPaths = applyPatchPaths(input);
      for (const path of patchPaths ?? []) {
        const result = decide({ projectDir, filePath: path, mode });
        if (result.action === "block") {
          console.error(result.reason);
          process.exit(2);
        }
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
