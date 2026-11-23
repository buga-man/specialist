#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook (Edit/Write/MultiEdit): everything that follows an edit,
 * in one process and one deterministic order — the boundary-visibility notes, the
 * formatter, the linter, and (opt-in, `.vuln-guard = always`) the semgrep edit scan.
 *
 * Why one adapter: three separate registrations on one event gave no ordering promise —
 * `prettier --write` racing `eslint --fix` on the same file is a corrupted fix at best,
 * and format-then-lint is the order the fixes compose in. Every check runs even when a
 * previous one failed (no short-circuit) — the findings arrive together.
 *
 * Protocol: hook JSON on stdin; notes/findings = exit 2 with the text on stderr (Claude
 * Code feeds it back to the agent — the same channel git-watch uses for signals);
 * nothing to say = exit 0 silently.
 * Fail-safe: any internal error → exit 0 (never break the workflow on hook errors).
 */
import { formatFile } from "./format-core.mjs";
import { lintFile } from "./lint-core.mjs";
import { readVulnMode, scanEditedFiles } from "./vuln-core.mjs";
import { scopeChangeNotes } from "./spec-core.mjs";
import { readHookPayload, resolveProjectDir, run } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const tool = String(payload?.tool_name || "");
  if (/^(Edit|Write|MultiEdit)$/i.test(tool)) {
    const projectDir = resolveProjectDir(payload);
    const filePath = String(payload?.tool_input?.file_path || "");
    const messages = scopeChangeNotes(payload?.tool_input || {}, projectDir);
    if (filePath) {
      const formatted = await formatFile({ projectDir, filePath, run });
      if (formatted && !formatted.ok) {
        messages.push(
          `format-guard (${formatted.tool}) could not format ${filePath} — fix the errors:\n${formatted.output}`,
        );
      }
      const linted = await lintFile({ projectDir, filePath, run });
      if (linted && !linted.ok) {
        messages.push(
          `lint-guard (${linted.tool}) reports violations in ${filePath} — fix the errors:\n${linted.output}`,
        );
      }
      if (readVulnMode(projectDir) === "always") {
        const scanned = await scanEditedFiles({ projectDir, files: [filePath], run });
        if (scanned) messages.push(scanned.reason);
      }
    }
    if (messages.length) {
      console.error(messages.join("\n\n"));
      process.exit(2);
    }
  }
} catch {
  /* fail-safe: never break the workflow on hook errors */
}
process.exit(0);
