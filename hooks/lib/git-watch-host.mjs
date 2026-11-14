/**
 * git-watch-host.mjs — the host-side helpers shared by the git-watch adapters (Claude
 * Code, Codex, OpenCode). Everything that touches the file system and git to answer one
 * question: "did the derived support artifacts go stale?" The pure decision logic lives
 * in git-watch-core.mjs; the per-host wrappers only translate the verdict into their
 * host's output protocol.
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signalMessage } from "./git-watch-core.mjs";
import { compareIndex, selectPaths } from "../../skills/kb-index/scripts/lib/kb-core.mjs";
import {
  computeHash,
  gitRoot,
  listMarkdownFiles,
  readConfig,
  readDoc,
  readIndex,
} from "../../skills/kb-index/scripts/lib/kb-fs.mjs";
import {
  countCodeCommits,
  freshness,
  parseFrontmatter,
  parseGitLog,
  todayISO,
} from "../../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { gitCommitsSince, readCodestyleDoc } from "../../skills/codestyle/scripts/lib/codestyle-fs.mjs";

/** The root of the plugin: the repository root (hooks/lib sits two levels below it). */
export const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The path of the kb.mjs CLI, for the rebuild command in the signal. */
export const KB_CLI = join(PLUGIN_ROOT, "skills", "kb-index", "scripts", "kb.mjs");

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

/** { changed, added, missing } counts when the index diverged from the disk, else null. */
export function indexState(projectDir) {
  const index = readIndex(projectDir);
  if (!index) return null;
  const config = readConfig(projectDir);
  const disk = selectPaths(listMarkdownFiles(projectDir), config).map((path) => ({
    path,
    hash: computeHash(readDoc(projectDir, path)),
  }));
  const { changed, added, missing } = compareIndex(index, disk);
  if (!changed.length && !added.length && !missing.length) return null;
  return { changed: changed.length, added: added.length, missing: missing.length };
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
