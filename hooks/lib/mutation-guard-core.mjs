/**
 * mutation-guard-core.mjs — the outward-mutation classifier for the mutation-guard hook.
 *
 * The policy it encodes: any mutation outside the agent's working copy — a push to a
 * remote, a history rewrite, a forced discard of working-tree state — runs on the
 * user's explicit command, never on the agent's initiative. Commits are deliberately
 * not here: one task = one commit is the framework's own loop (spec-implementation).
 *
 * Recognized shapes (per segment of a && / || / ; chain, `git -C <dir>` prefixes
 * honored): git push, git reset --hard, git rebase, git branch -D / forced delete,
 * git clean, `git stash drop|clear`, `git checkout [--] <paths>` and
 * `git checkout <ref> -- <paths>` (both overwrite the working tree from an index or
 * a ref), and `git restore <paths>` (without --staged — unstaging discards nothing).
 *
 * Fail-safe direction: this core only ever says "block"; the adapter runs it solely
 * when .spec-gate opted in (`mutation-guard: on`), and any parse doubt reads as
 * "not recognized" — an unrecognized command is the host permission flow's business,
 * not this guard's.
 *
 * Pure data and pure functions only — no I/O (the house rule for cores).
 */

/** One segment matches an outward/history mutation → the reason line for the block. */
const MUTATION_PATTERNS = [
  { re: /^git(?:\s+-C\s+\S+)?\s+push\b/, what: "pushes to a remote" },
  { re: /^git(?:\s+-C\s+\S+)?\s+reset\s+(?:-[a-z]+\s+)*--hard\b/, what: "hard-resets history" },
  { re: /^git(?:\s+-C\s+\S+)?\s+rebase\b/, what: "rewrites history (rebase)" },
  { re: /^git(?:\s+-C\s+\S+)?\s+clean\b/, what: "deletes untracked files" },
  // `git stash drop|clear` destroys saved work with no working-copy trail — the same
  // hard-to-undo class as clean. Creating a stash or popping one is safe and not here.
  { re: /^git(?:\s+-C\s+\S+)?\s+stash\s+(?:drop|clear)\b/, what: "discards stashed work (stash drop/clear)" },
  // `git checkout -- <paths>` and `git checkout <ref> -- <paths>` both overwrite the
  // working tree; the optional ref (HEAD~2, a branch) makes the discard even deeper.
  { re: /^git(?:\s+-C\s+\S+)?\s+checkout\s+(?:\S+\s+)?--\s/, what: "discards working-tree changes" },
];

/** `git branch` force-deletes: a `-D` short flag (alone or combined, e.g. `-Dv`) or
 *  `--delete`/`-d` together with `--force`. A plain `-d` (delete a merged branch) is
 *  deliberately not the guard's business — the opt-in is for the hard-to-undo shapes. */
function branchForceDeletes(segment) {
  const m = segment.match(/^git(?:\s+-C\s+\S+)?\s+branch\b(.*)$/);
  if (!m) return null;
  const args = m[1].trim().split(/\s+/).filter(Boolean);
  // A short-flag cluster containing the uppercase D (-D, -Dv): /i stays off — `-d` is
  // not a force delete.
  if (args.some((a) => a === "-D" || (/^-[^-]/.test(a) && a.includes("D")))) {
    return "force-deletes branches";
  }
  if (args.includes("--force") && (args.includes("-d") || args.includes("--delete"))) {
    return "force-deletes branches";
  }
  return null;
}

/** `git restore` discards uncommitted work unless it only unstages (--staged). */
function restoreDiscards(segment) {
  const m = segment.match(/^git(?:\s+-C\s+\S+)?\s+restore\b(.*)$/);
  if (!m) return null;
  return m[1].includes("--staged") ? null : "discards working-tree changes (restore)";
}

/** Classify a whole Bash command line. Returns { action: "block", reason } when some
 *  segment is an outward/history mutation the guard covers, or null when it is not
 *  (commits, ordinary work, unrecognized shapes — not this guard's business). */
export function decideMutation(command) {
  const segments = String(command ?? "")
    .split(/\s*(?:&&|\|\||;|\r?\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const what =
    (seg) => {
      for (const { re, what } of MUTATION_PATTERNS) if (re.test(seg)) return what;
      return branchForceDeletes(seg) ?? restoreDiscards(seg);
    };
  for (const segment of segments) {
    const found = what(segment);
    if (found) {
      return {
        action: "block",
        reason:
          `mutation-guard: "${segment}" ${found}. Outward and history-mutating operations ` +
          "run on the user's explicit command, not the agent's initiative — confirm with " +
          "the user in chat; if they already approved, ask them to run it themselves, or " +
          "have them set `mutation-guard: off` in .spec-gate. Commits are not affected " +
          "(one task = one commit stays the framework's own loop).",
      };
    }
  }
  return null;
}
