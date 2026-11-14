/**
 * git-watch-host.mjs — the host-side helpers shared by the git-watch adapters (Claude
 * Code, Codex, OpenCode). Everything that touches the file system and git to answer one
 * question: "did the derived support artifacts go stale?" The pure decision logic lives
 * in git-watch-core.mjs, the index reconcile in kb-gate-core.mjs; the per-host wrappers
 * only translate the verdict into their host's output protocol.
 */
import { resolve } from "node:path";
import { signalMessage } from "./git-watch-core.mjs";
import { indexStaleness } from "./kb-gate-core.mjs";
import { KB_CLI, PLUGIN_ROOT } from "./hook-kit.mjs";
import { gitRoot } from "../../skills/kb-index/scripts/lib/kb-fs.mjs";
import {
  countCodeCommits,
  freshness,
  parseFrontmatter,
  parseGitLog,
  todayISO,
} from "../../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { gitCommitsSince, readCodestyleDoc } from "../../skills/codestyle/scripts/lib/codestyle-fs.mjs";

export { KB_CLI, PLUGIN_ROOT };

/** The project directories the git operations touched: the `git -C <dir>` targets when
 *  given, else CLAUDE_PROJECT_DIR (Claude Code), else the git root of the session cwd,
 *  else the cwd itself. */
export function touchedProjectDirs(commands, cwd) {
  return [
    ...new Set(
      commands.map((c) => (c.dir ? resolve(cwd, c.dir) : process.env.CLAUDE_PROJECT_DIR || gitRoot(cwd) || cwd)),
    ),
  ];
}

/** The index staleness (diverging paths by kind), or null when there is no index or
 *  it matches the disk. */
export function indexState(projectDir) {
  return indexStaleness(projectDir);
}

/** The freshness verdict when CODESTYLE.md is stale, else null (no honest data — no signal). */
export function codestyleState(projectDir) {
  const text = readCodestyleDoc(projectDir);
  if (text === null) return null;
  const doc = parseFrontmatter(text);
  if (!doc) return null;
  const log = gitCommitsSince(projectDir, doc.base);
  if (log === null) return null;
  const verdict = freshness({
    base: doc.base,
    generated: doc.generated,
    codeCommits: countCodeCommits(parseGitLog(log)),
    today: todayISO(new Date()),
  });
  return verdict.stale ? verdict : null;
}

/** The one-line git-watch signal for the given project directory, or null. */
export function watchSignal(projectDir) {
  return signalMessage({
    index: indexState(projectDir),
    codestyle: codestyleState(projectDir),
    kbCli: KB_CLI,
    projectDir,
  });
}
