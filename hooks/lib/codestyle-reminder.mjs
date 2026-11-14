#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: one line of context when CODESTYLE.md may be stale.
 *
 * Staleness is a repository property, not an event: code commits since the base
 * recorded in the document's frontmatter, or days since its generated date — both
 * derive from git and the document, so no state file is needed. The verdict comes
 * from codestyleState() (git-watch-host.mjs) — the same computation the git-watch
 * signal uses. When the threshold is crossed, one reminder line goes to stdout
 * (SessionStart stdout becomes session context); the decision to rebuild belongs to
 * the user, so the hook never blocks.
 *
 * Silent: without a document, on a broken document, when git cannot answer and on
 * any internal error (fail-safe — a reminder must never break the session).
 */
import { reminderLine } from "../../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { codestyleState } from "./git-watch-host.mjs";
import { readHookPayload, resolveProjectDir } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const verdict = codestyleState(resolveProjectDir(payload));
  if (verdict) console.log(reminderLine(verdict));
} catch {
  /* fail-safe: a reminder must never break the session */
}
process.exit(0);
