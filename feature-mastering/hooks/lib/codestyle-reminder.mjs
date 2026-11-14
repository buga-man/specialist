#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: one line of context when CODESTYLE.md may be stale.
 *
 * Staleness is a repository property, not an event: code commits since the base
 * recorded in the document's frontmatter, or days since its generated date — both
 * derive from git and the document, so no state file is needed. When the threshold
 * is crossed, one reminder line goes to stdout (SessionStart stdout becomes session
 * context); the decision to rebuild belongs to the user, so the hook never blocks.
 *
 * Silent: without a document, on a broken document, when git cannot answer and on
 * any internal error (fail-safe — a reminder must never break the session).
 */
import { readFileSync } from "node:fs";
import {
  countCodeCommits,
  freshness,
  parseFrontmatter,
  parseGitLog,
  reminderLine,
  todayISO,
} from "../../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { gitCommitsSince, readCodestyleDoc, resolveProjectDir } from "../../skills/codestyle/scripts/lib/codestyle-fs.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  payload = {};
}

try {
  const cwd = String(payload?.cwd || process.cwd());
  const projectDir = resolveProjectDir(cwd);

  const text = readCodestyleDoc(projectDir);
  if (text === null) process.exit(0); // no document — the hook does not exist here
  const doc = parseFrontmatter(text);
  if (!doc) process.exit(0); // broken frontmatter — nothing honest to say

  const log = gitCommitsSince(projectDir, doc.base);
  if (log === null) process.exit(0); // no git or unknown base (rebase, shallow) — stay silent

  const verdict = freshness({
    base: doc.base,
    generated: doc.generated,
    codeCommits: countCodeCommits(parseGitLog(log)),
    today: todayISO(new Date()),
  });
  if (verdict.stale) console.log(reminderLine(verdict));
} catch {
  /* fail-safe: a reminder must never break the session */
}
process.exit(0);
