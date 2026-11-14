#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the lint-guard twin for Codex.
 * Runs the project's linter with --fix on every file the edit payload touches; the
 * remaining violations come back as ONE `additionalContext` JSON line on stdout (Codex
 * PostToolUse is record-only — it cannot block retroactively, and multiple stdout
 * JSON lines are not reliably parsed, so all findings are aggregated into one envelope).
 * No project linter / non-code file / linter trouble / any internal error → silent exit 0.
 */
import { resolve } from "node:path";
import { lintFile } from "./lint-core.mjs";
import { editedFilePaths } from "./spec-core.mjs";
import { codexContext, readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const projectDir = resolveProjectDir(payload);
  const cwd = String(payload?.cwd || process.cwd()); // patch paths are relative to the session cwd
  const failures = [];
  for (const rel of editedFilePaths(payload?.tool_input || {})) {
    const result = await lintFile({ projectDir, filePath: resolve(cwd, rel), run });
    if (result && !result.ok) {
      failures.push(`lint-guard (${result.tool}) reports violations in ${rel} — fix the errors:\n${result.output}`);
    }
  }
  if (failures.length) console.log(codexContext("PostToolUse", failures.join("\n\n")));
} catch {
  /* fail-safe: never break the workflow on hook errors */
}
process.exit(0);
