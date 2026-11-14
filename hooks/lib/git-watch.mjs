#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook (Bash): signals the agent when a tree-changing git
 * operation (commit, checkout/switch, merge, rebase, pull, reset, cherry-pick, stash
 * pop/apply) has left the derived support artifacts stale.
 *
 * The tree changed underneath the agent, not by its edits — the hook evaluates both
 * artifacts statelessly (against the disk, so the source of the change does not
 * matter): the documentation index is rebuilt on the agent's own (derived data; the
 * Stop gate would demand it anyway), the codestyle document is committed content —
 * the agent must ask the user before touching it. Neither is ever updated silently.
 *
 * Protocol: hook JSON on stdin; a signal = exit 2 with the message on stderr (Claude
 * Code feeds PostToolUse stderr to the agent). Nothing stale, a non-git command, a
 * missing artifact and any internal error are all exit 0 (fail-safe).
 * Git run by the user outside the agent is invisible here — the next SessionStart /
 * Stop checks cover it (documented boundary).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signalMessage, treeChangingCommands } from "./git-watch-core.mjs";
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

const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  payload = {};
}

try {
  if (payload?.tool_name !== "Bash") process.exit(0);
  const commands = treeChangingCommands(String(payload?.tool_input?.command || ""));
  if (!commands.length) process.exit(0);

  const cwd = String(payload?.cwd || process.cwd());
  const dirs = [
    ...new Set(
      commands.map((c) => (c.dir ? resolve(cwd, c.dir) : process.env.CLAUDE_PROJECT_DIR || gitRoot(cwd) || cwd)),
    ),
  ];

  for (const projectDir of dirs) {
    const message = signalMessage({
      index: indexState(projectDir),
      codestyle: codestyleState(projectDir),
      kbCli: join(PLUGIN_ROOT, "skills", "kb-index", "scripts", "kb.mjs"),
      projectDir,
    });
    if (message) {
      console.error(message);
      process.exit(2);
    }
  }
} catch {
  /* fail-safe: a signal must never break the workflow */
}
process.exit(0);

/** { changed, added, missing } counts when the index diverged from the disk, else null. */
function indexState(projectDir) {
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
function codestyleState(projectDir) {
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
