#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the edit-scan side of vuln-guard for
 * Codex. With the project's .vuln-guard mode set to "always", every file the edit
 * payload touches is scanned with semgrep — the whole patch in ONE invocation (one
 * probe, one spawn). Findings are delivered as ONE `additionalContext` JSON line on
 * stdout (record-only — Codex PostToolUse cannot block retroactively, and multiple
 * stdout JSON lines are not reliably parsed).
 * Mode other than "always" / no semgrep / clean scan / broken scanner → silent exit 0.
 */
import { resolve } from "node:path";
import { editedFilePaths } from "./spec-core.mjs";
import { readVulnMode, scanEditedFiles } from "./vuln-core.mjs";
import { codexContext, readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const projectDir = resolveProjectDir(payload);
  if (readVulnMode(projectDir) !== "always") process.exit(0);
  const cwd = String(payload?.cwd || process.cwd()); // patch paths are relative to the session cwd
  const files = editedFilePaths(payload?.tool_input || {}).map((rel) => resolve(cwd, rel));
  const result = await scanEditedFiles({ projectDir, files, run });
  if (result) console.log(codexContext("PostToolUse", result.reason));
} catch {
  /* fail-safe: never break the workflow on hook errors */
}
process.exit(0);
