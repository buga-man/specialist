/**
 * mutation-guard-core.mjs — the outward-mutation classifier for the mutation-guard hook.
 *
 * The policy it encodes: any mutation outside the agent's working copy — a push to a
 * remote, a history rewrite, a forced discard of working-tree state — runs on the
 * user's explicit command, never on the agent's initiative. A second class with the
 * same destination: the hook bypasses — `git commit --no-verify`, `git push
 * --no-verify`, `git -c core.hooksPath=<any> <cmd>` — shapes that silence the very git
 * hooks the other guards ride on. Commits are deliberately not here: one task =
 * one commit is the framework's own loop (spec-implementation).
 *
 * Recognized shapes (per segment of a && / || / ; chain, `git -C <dir>` prefixes
 * honored): git push, git reset --hard, git rebase, git branch -D / forced delete,
 * git clean, `git stash drop|clear`, `git checkout [--] <paths>` and
 * `git checkout <ref> -- <paths>` (both overwrite the working tree from an index or
 * a ref), `git restore <paths>` (without --staged — unstaging discards nothing), and
 * the bypass class: `git commit --no-verify` (short `-n` too, alone or inside a
 * short-flag cluster), `git push --no-verify` (the long form only — a push's `-n` is
 * --dry-run), and `git -c core.hooksPath=<any> <cmd>` among the leading global
 * options.
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

/** Quote-aware tokenization of a command tail — the shape the other Bash cores use: a
 *  quoted `-m "fix --no-verify flag"` message stays ONE token, so a flag named inside
 *  prose does not count as a flag. */
const shellTokens = (s) => String(s ?? "").match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

/** `git commit` skipping the commit hooks: the long `--no-verify` or its short `-n`
 *  (alone or inside a short-flag cluster, e.g. `-nm "x"`). The cluster is scanned left
 *  to right and stops at `m` — the message option swallows the rest of the cluster, so
 *  `-amn` is `-a -m"n"`, not a no-verify. Options that take a value (`-m`, `--message`,
 *  `-C <commit>` reuse…) skip their value token: only actual flags are examined. */
function commitSkipsHooks(segment) {
  const m = segment.match(/^git(?:\s+-C\s+\S+)?\s+commit\b(.*)$/);
  if (!m) return null;
  const VALUE_OPTS = new Set([
    "-m", "-F", "-t", "-C", "-c", "--message", "--file", "--template",
    "--reuse-message", "--reedit-message", "--fixup", "--squash",
  ]);
  const what = "bypasses the commit hooks (--no-verify)";
  const args = shellTokens(m[1]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE_OPTS.has(a)) {
      i++; // the next token is the option's value — never a flag
      continue;
    }
    if (a === "--no-verify") return what;
    if (/^-[^-]/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === "m") break; // the message swallows the rest of the cluster
        if (ch === "n") return what;
      }
    }
  }
  return null;
}

/** `git push --no-verify` — the long form only: for push the short `-n` is --dry-run,
 *  not a bypass (the short and the long flag diverge between subcommands). The plain
 *  push itself is the mutation pattern's business; this only sharpens the reason. */
function pushSkipsHooks(segment) {
  const m = segment.match(/^git(?:\s+-C\s+\S+)?\s+push\b(.*)$/);
  if (!m) return null;
  return shellTokens(m[1]).includes("--no-verify")
    ? "bypasses the push hooks (--no-verify)"
    : null;
}

/** `git -c core.hooksPath=<any> <cmd>`: pointing git at a different hooks directory
 *  disables every git-boundary gate at once — the single most efficient bypass there
 *  is, so any command riding on it classifies. Only the leading global options are
 *  walked (`-C <dir>` and `-c <cfg>` may repeat and interleave); the key matches
 *  case-insensitively (git normalizes config keys), and an empty value counts too — it
 *  disables hooks outright. Other `-c` settings (user.name) are ordinary configuration,
 *  not a bypass. */
function hooksPathDisplaced(segment) {
  if (!/^git\s/.test(segment)) return null;
  const args = shellTokens(segment);
  for (let i = 1; i < args.length; i += 2) {
    if (args[i] === "-C") continue;
    if (args[i] === "-c") {
      const cfg = String(args[i + 1] ?? "").replace(/^["']|["']$/g, "");
      if (/^core\.hookspath\s*=/i.test(cfg)) {
        return "displaces the hooks directory (core.hooksPath), silencing every git-boundary gate at once";
      }
      continue;
    }
    break; // the subcommand — the global options are over
  }
  return null;
}

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
 *  segment is an outward/history mutation or a hook bypass the guard covers, or null
 *  when it is not (plain commits, ordinary work, unrecognized shapes — not this
 *  guard's business). */
export function decideMutation(command) {
  const segments = String(command ?? "")
    .split(/\s*(?:&&|\|\||;|\r?\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const mutationWhat = (seg) => {
    for (const { re, what } of MUTATION_PATTERNS) if (re.test(seg)) return what;
    return branchForceDeletes(seg) ?? restoreDiscards(seg);
  };
  for (const segment of segments) {
    // The bypass class first: `git push --no-verify` is both a push and a bypass, and
    // the bypass reading names the sharper reason to hand the agent.
    const bypass =
      commitSkipsHooks(segment) ?? pushSkipsHooks(segment) ?? hooksPathDisplaced(segment);
    if (bypass) {
      return {
        action: "block",
        reason:
          `mutation-guard: "${segment}" ${bypass}. The git-boundary gates (secrets-guard, ` +
          "vuln-guard, suite-gate) are git hooks — this shape skips them. Issue the plain " +
          "command instead and let the hooks speak; when one blocks, fix what it points " +
          "at. Skipping hooks is the user's decision — ask them to run it themselves, or " +
          "set `mutation-guard: off` in .spec-gate.",
      };
    }
    const found = mutationWhat(segment);
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
