#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the format-guard twin for Codex.
 * Runs the project's formatter on every file the edit payload touches (a patch may
 * touch several), auto-fixes what it can. Codex PostToolUse is record-only, so the
 * failures come back as ONE `additionalContext` JSON line on stdout (guidance the
 * agent acts on immediately) — multiple stdout JSON lines are not reliably parsed,
 * so all findings are aggregated into a single envelope.
 * No project formatter / non-code file / any internal error → silent exit 0 (fail-safe).
 */
import { resolve } from "node:path";
import { formatFile } from "./format-core.mjs";
import { editedFilePaths } from "./spec-core.mjs";
import { codexContext, readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const projectDir = resolveProjectDir(payload);
  const cwd = String(payload?.cwd || process.cwd()); // patch paths are relative to the session cwd
  const failures = [];
  for (const rel of editedFilePaths(payload?.tool_input || {})) {
    const result = await formatFile({ projectDir, filePath: resolve(cwd, rel), run });
    if (result && !result.ok) {
      failures.push(`format-guard (${result.tool}) could not format ${rel} — fix the errors:\n${result.output}`);
    }
  }
  if (failures.length) console.log(codexContext("PostToolUse", failures.join("\n\n")));
} catch {
  /* fail-safe: never break the workflow on hook errors */
}
process.exit(0);
