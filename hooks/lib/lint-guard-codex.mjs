#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the lint-guard twin for Codex.
 * Runs the project's linter with --fix on every file the edit payload touches; the
 * remaining violations come back as `additionalContext` JSON on stdout (Codex PostToolUse
 * is record-only — it cannot block retroactively).
 * No project linter / non-code file / linter trouble / any internal error → silent exit 0.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { editedFilePaths } from "./spec-core.mjs";
import { lintFile } from "./lint-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const projectDir = String(payload?.cwd || process.cwd());
  const filePaths = editedFilePaths(payload?.tool_input || {});
  for (const rel of filePaths) {
    const filePath = resolve(projectDir, rel);
    const result = await lintFile({ projectDir, filePath, run });
    if (result && !result.ok) {
      console.log(postContext(`lint-guard (${result.tool}) reports violations in ${rel} — fix the errors:\n${result.output}`));
    }
  }
} catch {
  /* fail-safe: never break the workflow on hook errors */
}
process.exit(0);

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { ...opts, encoding: "utf8", windowsHide: true });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function postContext(text) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text },
  });
}
