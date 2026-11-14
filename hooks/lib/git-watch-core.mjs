/**
 * git-watch-core.mjs — shared logic for the git-watch hook.
 *
 * Used by the Claude Code hook (hooks/lib/git-watch.mjs). The contract:
 *
 *   - After a tree-changing git operation (commit, checkout/switch, merge, rebase,
 *     pull, reset, cherry-pick, stash pop/apply) the derived support artifacts of the
 *     project may have gone stale — the tree changed underneath the agent, not by its
 *     edits. The hook evaluates both artifacts statelessly (against the disk, so the
 *     source of the change — a branch, a rebase, a pull — does not matter).
 *   - Two artifacts, two policies: the documentation index is pure derived data — the
 *     signal says to rebuild it now (the Stop gate would demand it anyway); the
 *     codestyle document is committed content — the signal says to ask the user
 *     before touching it. The agent must never update either silently.
 *   - Git run by the user outside the agent is invisible until the next SessionStart
 *     or Stop check — a documented boundary, like the Bash boundary of spec-gate.
 *
 * Fail-safe: unparsable commands read as "not tree-changing".
 */
import { gitCommands } from "./secrets-core.mjs";

/** git subcommands whose result can change the worktree or the commit graph. */
const TREE_OPS = new Set(["commit", "checkout", "switch", "merge", "rebase", "pull", "reset", "cherry-pick"]);

const OPS_PATTERN = "add|commit|push|checkout|switch|merge|rebase|pull|reset|cherry-pick|stash";

/** Parses a (possibly compound) shell command into its tree-changing git invocations
 *  ({ sub, rest, dir } — reuses the secrets-core parser). `git stash` counts only as
 *  pop/apply; a bare stash list/save does not. */
export function treeChangingCommands(command) {
  return gitCommands(command, OPS_PATTERN).filter(
    ({ sub, rest }) => TREE_OPS.has(sub) || (sub === "stash" && /^(?:pop|apply)\b/.test(rest)),
  );
}

/** The one-line signal for the agent, or null when both artifacts are fine.
 *  `index` — { changed, added, missing } path arrays or null (no index / in sync);
 *  `codestyle` — a stale freshness verdict or null; kbCli and projectDir go into the
 *  rebuild command verbatim. */
export function signalMessage({ index, codestyle, kbCli, projectDir }) {
  const parts = [];
  if (index) {
    const detail = (paths) =>
      Array.isArray(paths) && paths.length
        ? `${paths.length} (${paths.slice(0, 3).join(", ")}${paths.length > 3 ? `, +${paths.length - 3} more` : ""})`
        : "0";
    parts.push(
      `the documentation index is stale (${detail(index.changed)} changed, ${detail(index.added)} added, ` +
        `${detail(index.missing)} removed) — rebuild it now, it is derived data: node "${kbCli}" build --project "${projectDir}"`,
    );
  }
  if (codestyle) {
    const days = codestyle.days !== null ? `, ${codestyle.days} days` : "";
    parts.push(
      `CODESTYLE.md may be stale (${codestyle.codeCommits} code commits${days} since base ` +
        `${String(codestyle.base).slice(0, 7)}) — do not update it on your own: ask the user ` +
        "whether to run the codestyle skill (verify mode)",
    );
  }
  return parts.length ? `git-watch: the tree changed under you — ${parts.join("; ")}.` : null;
}
