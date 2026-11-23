#!/usr/bin/env node
/**
 * Codex PostToolUse hook (Edit/Write/apply_patch): the edit-guard twin for Codex —
 * everything that follows an edit, in one process and one deterministic order: the
 * boundary-visibility notes, the formatter, the linter (auto-fixing what they can),
 * and (opt-in, `.vuln-guard = always`) one semgrep scan over every file the payload
 * touches. One adapter instead of three registrations: no concurrent formatter/linter
 * writes on one file, and a guaranteed format-then-lint order. Every check runs even
 * when a previous one failed — the findings arrive together.
 *
 * Codex PostToolUse is record-only, so everything is delivered as ONE
 * `additionalContext` JSON line on stdout (multiple stdout JSON lines are not reliably
 * parsed). No formatter/linter/scanner or nothing to say / any internal error →
 * silent exit 0 (fail-safe).
 */
import { resolve } from "node:path";
import { formatFile } from "./format-core.mjs";
import { lintFile } from "./lint-core.mjs";
import { readVulnMode, scanEditedFiles } from "./vuln-core.mjs";
import { editedFilePaths, scopeChangeNotes } from "./spec-core.mjs";
import { codexContext, readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const projectDir = resolveProjectDir(payload);
  const cwd = String(payload?.cwd || process.cwd()); // patch paths are relative to the session cwd
  const rels = editedFilePaths(payload?.tool_input || {});
  const messages = scopeChangeNotes(payload?.tool_input || {}, projectDir);

  for (const rel of rels) {
    const abs = resolve(cwd, rel);
    const formatted = await formatFile({ projectDir, filePath: abs, run });
    if (formatted && !formatted.ok) {
      messages.push(`format-guard (${formatted.tool}) could not format ${rel} — fix the errors:\n${formatted.output}`);
    }
    const linted = await lintFile({ projectDir, filePath: abs, run });
    if (linted && !linted.ok) {
      messages.push(`lint-guard (${linted.tool}) reports violations in ${rel} — fix the errors:\n${linted.output}`);
    }
  }
  if (rels.length && readVulnMode(projectDir) === "always") {
    const scanned = await scanEditedFiles({ projectDir, files: rels.map((rel) => resolve(cwd, rel)), run });
    if (scanned) messages.push(scanned.reason);
  }

  if (messages.length) console.log(codexContext("PostToolUse", messages.join("\n\n")));
} catch {
  /* fail-safe: never break the workflow on hook errors */
}
process.exit(0);
