#!/usr/bin/env node
/**
 * Codex PreToolUse hook: the config-guard twin for Codex — an edit of an EXISTING
 * linter/formatter config or its ignore file is blocked; creating one where none
 * exists is allowed (bootstrap); the block points at the deliberate path (the user
 * edits the config themselves). Codex speaks the same exit-2 block protocol as Claude
 * Code for PreToolUse; what differs is the payload: `apply_patch` carries the whole
 * patch text instead of a file_path, so every file the patch touches is checked — an
 * Update/Delete of a protected config blocks, an Add passes (nothing to weaken yet).
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr; allow =
 * exit 0 silently. Fail-safe: unknown shapes, a stat error and any internal error →
 * exit 0 — a failed check never blocks a creation.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { configGuardReason } from "./config-guard-core.mjs";
import { applyPatchPaths } from "./spec-core.mjs";
import { readHookPayload } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const tool = String(payload?.tool_name || "");
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/i.test(tool)) {
    const input = payload?.tool_input || {};
    const cwd = String(payload?.cwd || process.cwd()); // patch paths are relative to the session cwd
    const filePath = String(input.file_path || input.notebook_path || "");
    // existsSync never throws; a stat error reads as false — "not on disk" — which
    // the core reads as a creation and never blocks.
    if (filePath) {
      const reason = configGuardReason(filePath, existsSync(resolve(cwd, filePath)));
      if (reason) {
        console.error(reason);
        process.exit(2);
      }
    } else {
      // No single target file — an apply_patch-style payload. Unknown shapes read as
      // null and stay silent; a recognizable patch is checked file by file.
      for (const path of applyPatchPaths(input) ?? []) {
        const reason = configGuardReason(path, existsSync(resolve(cwd, path)));
        if (reason) {
          console.error(reason);
          process.exit(2);
        }
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
