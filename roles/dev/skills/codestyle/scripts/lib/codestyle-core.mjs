/**
 * codestyle-core.mjs — shared logic for the codestyle skill and its session-start
 * reminder hook.
 *
 * Used by the Claude Code hook adapter (codestyle-reminder.mjs, host-side) and the CLI
 * (scripts/codestyle.mjs — the single source of truth on freshness, the skill's
 * verify mode reads the same verdict). The contract it computes:
 *
 *   - CODESTYLE.md in the project root carries frontmatter:
 *       codestyle: 1            — schema of the artifact;
 *       generated: YYYY-MM-DD   — when the document was (re)built;
 *       base: <git hash>        — the commit the document was built at.
 *   - Staleness is a property of the repository, not of an event: N commits that
 *     touched at least one code file since `base`, or N days since `generated`.
 *     Both numbers derive from git and the document itself, so no state file is
 *     needed. The "not markdown = code" heuristic is deliberately rough — the
 *     cost of a false reminder is one line of context.
 *   - The reminder never blocks: staleness is a possible problem, not a proven
 *     one — the decision to rebuild belongs to the user (unlike kb-gate, where
 *     a hash mismatch is a proven fact).
 *
 * Fail-safe: a missing or broken document, a broken date — every oddity reads as
 * "nothing to say" on the caller's side.
 */

/** The name of the artifact in the project root. */
export const DOC_NAME = "CODESTYLE.md";

/** Code commits since `base` that make the document stale. */
export const STALE_COMMITS = 30;

/** Days since `generated` that make the document stale. */
export const STALE_DAYS = 30;

/** A code file at or above this many lines no longer fits one agent read — the
 *  agent-readability threshold the `scan` command reports (not a verdict: facts). */
export const LARGE_FILE = 500;

const HASH_RE = /^[0-9a-f]{7,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses the frontmatter of CODESTYLE.md.
 * Returns { base, generated } or null when the document carries none or a broken
 * one — including an unknown `codestyle` schema, which a newer writer may leave.
 */
export function parseFrontmatter(text) {
  if (typeof text !== "string") return null;
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return null;
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+)\s*:\s*(.*?)\s*$/);
    if (kv) fields[kv[1].toLowerCase()] = kv[2];
  }
  if (String(fields.codestyle ?? "").trim() !== "1") return null;
  const base = String(fields.base ?? "").trim().toLowerCase();
  const generated = String(fields.generated ?? "").trim();
  if (!HASH_RE.test(base)) return null;
  if (!DATE_RE.test(generated) || Number.isNaN(Date.parse(generated))) return null;
  return { base, generated };
}

/** A changed file counts as code unless it is markdown — or the codestyle
 *  document itself, whichever name it may carry in the future. */
export function isCodeFile(path) {
  const norm = String(path).replace(/\\/g, "/").toLowerCase();
  if (norm === DOC_NAME.toLowerCase()) return false;
  return !/\.md$/.test(norm);
}

/** Parses the output of `git log --pretty=format:%x1e%H --name-only` into
 *  [{ hash, files: [...] }]; records that parse wrong are skipped. */
export function parseGitLog(stdout) {
  const commits = [];
  for (const record of String(stdout).split("\x1e")) {
    const lines = record.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    const hash = lines[0].trim().toLowerCase();
    if (!HASH_RE.test(hash)) continue;
    commits.push({ hash, files: lines.slice(1) });
  }
  return commits;
}

/** Commits that touched at least one code file. */
export function countCodeCommits(commits) {
  return (Array.isArray(commits) ? commits : []).filter(
    (c) => Array.isArray(c?.files) && c.files.some(isCodeFile),
  ).length;
}

/** Whole days from a YYYY-MM-DD date to `today` (same format); null when either
 *  is broken or in the future — a future date is an error, not negative staleness. */
export function daysSince(generated, today) {
  if (!DATE_RE.test(String(generated)) || !DATE_RE.test(String(today))) return null;
  const ms = Date.parse(today) - Date.parse(generated);
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / DAY_MS);
}

/** The local date of a Date object as YYYY-MM-DD. Not UTC: `generated` is written
 *  from the team's wall clock, and comparing it to the UTC date near midnight reads
 *  the freshly generated document as "from the future" (days → null). */
export function todayISO(date) {
  const d = date instanceof Date ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The freshness verdict — the same shape the CLI prints and the verify mode reads.
 * `codeCommits` must be a number (the caller stays silent when git cannot answer);
 * `days` may be null (broken date) — then only the commit threshold applies.
 */
export function freshness({ base, generated, codeCommits, today }) {
  const commits = Number.isFinite(codeCommits) ? codeCommits : 0;
  const days = daysSince(generated, today);
  const stale = commits >= STALE_COMMITS || (days !== null && days >= STALE_DAYS);
  return { doc: "ok", stale, codeCommits: commits, days, base, generated };
}

/** The one line the reminder hook injects into the session context. */
export function reminderLine(verdict) {
  const parts = [`${verdict.codeCommits} code commits`];
  if (verdict.days !== null) parts.push(`${verdict.days} days`);
  return (
    `codestyle: ${DOC_NAME} may be stale (${parts.join(", ")} since base ${String(verdict.base).slice(0, 7)}` +
    `, generated ${verdict.generated}). Check it: run the codestyle skill in verify mode ` +
    'or node "<plugin>/skills/codestyle/scripts/codestyle.mjs" status.'
  );
}

/**
 * The agent-readability facts behind the `scan` command: how large the repo's own
 * code files are. Facts, not a verdict — a file over the threshold is reported,
 * judging it belongs to the generate/verify modes. Input is [{ path, lines }] as
 * measured by the fs layer (walkCodeFiles); output is the one-line JSON the CLI
 * prints and the skill's section 10 cites as evidence.
 */
export function readabilityFacts(files) {
  const list = (Array.isArray(files) ? files : [])
    .filter((f) => typeof f?.path === "string" && Number.isFinite(f?.lines))
    .map((f) => ({ file: f.path.replace(/\\/g, "/"), lines: f.lines }));
  const sorted = [...list].sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
  return {
    files: list.length,
    largest: sorted[0] ?? null,
    oversized: sorted.filter((f) => f.lines >= LARGE_FILE).slice(0, 5),
    limit: LARGE_FILE,
  };
}
