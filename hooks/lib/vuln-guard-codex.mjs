#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the edit-scan side of vuln-guard for
 * Codex. With the project's .vuln-guard mode set to "always", every file the edit
 * payload touches is scanned with semgrep; findings are delivered as `additionalContext`
 * JSON on stdout (record-only — Codex PostToolUse cannot block retroactively).
 * Mode other than "always" / no semgrep / clean scan / broken scanner → silent exit 0.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { editedFilePaths } from "./spec-core.mjs";
import { readVulnMode, scanSingleFile } from "./vuln-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const projectDir = String(payload?.cwd || process.cwd());
  if (readVulnMode(projectDir) !== "always") process.exit(0);
  const filePaths = editedFilePaths(payload?.tool_input || {});
  for (const rel of filePaths) {
    const result = await scanSingleFile({ projectDir, filePath: resolve(projectDir, rel), run });
    if (result) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: result.reason },
        }),
      );
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
