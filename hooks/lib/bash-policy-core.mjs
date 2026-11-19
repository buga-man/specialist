/**
 * bash-policy-core.mjs — the auto-approval policy for provably read-only Bash commands.
 *
 * A command is auto-approved only when every part of it passes three checks at once
 * (the tool-permission policy this encodes — one allow-list, fail-closed):
 *   1. read-only — the command head is on a conservative allow-list of inspection
 *      commands (git status/log/diff/show/blame, git branch/remote without mutating
 *      flags, ls, cat, pwd, test -e);
 *   2. workspace-bound — every token that looks like a path is relative and contains
 *      no ".." component (absolute paths and parent escapes never pass);
 *   3. no side-effect plumbing — no >, >>, <, pipes, command substitution, background
 *      &, or newlines into a second command; && / || / ; chaining is allowed only when
 *      every segment passes the same three checks.
 *
 * Anything else — including anything the parser is not sure about — is "none": the
 * caller stays silent and the host's normal permission flow decides. A classification
 * error can never widen what is auto-approved (fail-closed).
 *
 * Pure data and pure functions only — no I/O (the house rule for cores).
 */

/** Split a command line into its segments — the parts between && / || / ; separators.
 *  A separator inside quotes would be a false split, but a false split only ever
 *  produces a segment the allow-list does not recognize → "none" (fail-closed). */
export function splitSegments(command) {
  return String(command ?? "")
    .split(/\s*(?:&&|\|\||;|\r?\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Tokens that disqualify the whole command regardless of the command head:
 *  redirection (< >), pipes (a bare | — || was already a split separator), command
 *  substitution (backticks, $(, ${), backgrounding. */
const PLUMBING_RE = /[<>]|\||`|\$[\(\{]|&/;

/** git read-only commands: any arguments (they inspect, never mutate) — except an
 *  explicit --output=…, which writes a file. */
const GIT_READONLY = ["status", "log", "diff", "show", "blame"];

/** git branch flags that only list. Anything else (create/delete/rename/copy) is a
 *  mutation and not on the policy. */
const BRANCH_SAFE_FLAGS = new Set([
  "-a",
  "-r",
  "-v",
  "-vv",
  "-av",
  "-avv",
  "--all",
  "--list",
  "--remotes",
  "--show-current",
  "--verbose",
]);

/** A token that looks like a path (has a slash or a backslash) must stay inside the
 *  workspace: relative, no ".." component, no drive letter, no leading slash. Bare
 *  ".." and "~" (no separator) are escapes too. */
function pathTokenIsSafe(token) {
  if (token === ".." || token === "~") return false;
  if (!/[\\/]/.test(token)) return true; // no separator — a rev, a flag, a name
  const t = token.replace(/\\/g, "/");
  if (t.startsWith("/")) return false; // absolute POSIX path
  if (/^[A-Za-z]:/.test(t)) return false; // absolute Windows path
  if (/^~/.test(t)) return false; // home — outside the workspace
  const parts = t.split("/");
  return !parts.some((p) => p === ".."); // parent escape
}

/** git invocations with -C <dir> still parse: strip a leading `-C <dir>` pair (the
 *  directory itself must pass the path check). Returns the remaining tokens or null
 *  when -C is present without its directory. */
function stripGitDir(tokens) {
  if (tokens[0] !== "-C") return tokens;
  const dir = tokens[1];
  if (!dir || !pathTokenIsSafe(dir)) return null;
  return tokens.slice(2);
}

/** One segment verdict: allowed by the read-only allow-list? */
function segmentAllowed(segment) {
  if (PLUMBING_RE.test(segment)) return false;
  const tokens = segment.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => t.startsWith("--output")) ) return false; // git … --output=<file> writes
  if (tokens.some((t) => !pathTokenIsSafe(t))) return false;

  const head = tokens[0];
  if (head !== "git") {
    switch (head) {
      case "pwd":
        return tokens.length === 1;
      case "cat":
      case "ls":
        return tokens.slice(1).every((t) => !t.startsWith("-") || /^-{1,2}[A-Za-z]+$/.test(t));
      case "test": {
        const rest = tokens.slice(1);
        return (
          rest.length === 2 &&
          ["-e", "-f", "-d"].includes(rest[0]) &&
          pathTokenIsSafe(rest[1])
        );
      }
      default:
        return false;
    }
  }

  // git …
  const afterDir = stripGitDir(tokens.slice(1));
  if (!afterDir || afterDir.length === 0) return false;
  const sub = afterDir[0];
  if (GIT_READONLY.includes(sub)) return true;
  if (sub === "remote") {
    const rest = afterDir.slice(1);
    return rest.length === 0 || (rest.length === 1 && ["-v", "--verbose"].includes(rest[0]));
  }
  if (sub === "branch") {
    const rest = afterDir.slice(1);
    const flags = rest.filter((t) => t.startsWith("-"));
    const operands = rest.filter((t) => !t.startsWith("-"));
    // An operand is a *filter pattern*, and only with --list: without it `git branch
    // <name>` creates a branch — a glob char alone is not proof of listing intent.
    return (
      flags.every((f) => BRANCH_SAFE_FLAGS.has(f)) &&
      (operands.length === 0 || (flags.includes("--list") && operands.length === 1))
    );
  }
  return false;
}

/** The policy decision for a whole Bash command line.
 *  Returns { decision: "allow", reason } — every segment passed all three checks;
 *  or { decision: "none" } — not provably read-only; the caller stays silent and the
 *  host's own permission flow decides. */
export function decideApproval(command) {
  const segments = splitSegments(command);
  if (segments.length === 0) return { decision: "none" };
  for (const segment of segments) {
    if (!segmentAllowed(segment)) return { decision: "none" };
  }
  return {
    decision: "allow",
    reason: "bash-policy: read-only, workspace-bound, no side-effect plumbing — auto-approved",
  };
}
