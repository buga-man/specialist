#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the format-guard twin for Codex.
 * Runs the project's formatter on every file the edit payload touches (a patch may
 * touch several), auto-fixes what it can. Codex PostToolUse is record-only, so a
 * failure is delivered as `additionalContext` JSON on stdout — guidance the agent acts
 * on immediately — instead of Claude Code's exit-2-with-stderr.
 * No project formatter / non-code file / any internal error → silent exit 0 (fail-safe).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { editedFilePaths } from "./spec-core.mjs";
import { formatFile } from "./format-core.mjs";

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
    const result = await formatFile({ projectDir, filePath, run });
    if (result && !result.ok) {
      console.log(postContext(`format-guard (${result.tool}) could not format ${rel} — fix the errors:\n${result.output}`));
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
