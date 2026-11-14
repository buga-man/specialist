#!/usr/bin/env node
/**
 * Codex SessionStart hook: the codestyle-reminder twin for Codex. One line of context
 * when CODESTYLE.md may be stale, printed as `additionalContext` JSON on stdout (Codex
 * injects it into the session context; plain stdout is not picked up there).
 * The verdict comes from codestyleState() (git-watch-host.mjs) — the same computation
 * the Claude Code reminder and the git-watch signal use. Staleness is a repository
 * property, not an event: code commits since the base recorded in the document's
 * frontmatter, or days since its generated date. The decision to rebuild belongs to
 * the user, so the hook never blocks.
 * Silent: without a document, on a broken document, when git cannot answer and on any
 * internal error (fail-safe).
 */
import { reminderLine } from "../../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { codestyleState } from "./git-watch-host.mjs";
import { codexContext, readHookPayload, resolveProjectDir } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const verdict = codestyleState(resolveProjectDir(payload));
  if (verdict) console.log(codexContext("SessionStart", reminderLine(verdict)));
} catch {
  /* fail-safe: a reminder must never break the session */
}
process.exit(0);
