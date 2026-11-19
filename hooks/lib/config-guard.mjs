#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (matcher "Edit|Write|MultiEdit|NotebookEdit"): blocks the
 * agent from weakening the project's quality tools — an edit of an EXISTING
 * linter/formatter config or its ignore file is blocked; creating one where none
 * exists is allowed (bootstrap). The block names the deliberate path: the user edits
 * the config themselves.
 *
 * Always on — the spec-gate pattern: no opt-in marker, because the check is one
 * basename lookup and the blocked class is narrow (the secrets/spec gates made the
 * same call; the behavior-changing gates — suite-gate, mutation-guard — are the opt-in
 * ones). The escape hatch is not a flag but ownership: the config is the user's file
 * to change.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code and ZCode feed it back to the agent), allow = exit 0 silently.
 * Fail-safe: unknown shapes, a stat error and any internal error → exit 0 — a failed
 * check never blocks a creation.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { configGuardReason } from "./config-guard-core.mjs";
import { readHookPayload } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/i.test(String(payload?.tool_name || ""))) {
    const input = payload?.tool_input || {};
    const filePath = String(input.file_path || input.notebook_path || "");
    if (filePath) {
      // existsSync never throws; a stat error reads as false — "not on disk" — which
      // the core reads as a creation and never blocks.
      const abs = resolve(String(payload?.cwd || process.cwd()), filePath);
      const reason = configGuardReason(filePath, existsSync(abs));
      if (reason) {
        console.error(reason);
        process.exit(2);
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
