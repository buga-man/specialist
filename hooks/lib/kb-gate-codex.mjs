#!/usr/bin/env node
/**
 * Codex Stop hook: the kb-gate twin for Codex. Keeps the documentation index in sync
 * with the disk: when a document changed, was added or removed after the last build,
 * the end of the turn is blocked with a rebuild command. Codex Stop reads the block
 * decision from stdout JSON ({"decision": "block", "reason": "…"}) — Claude Code uses
 * exit 2 with stderr, hence this dedicated adapter.
 *
 * Protocol: hook JSON on stdin; block = the JSON above on stdout; allow = exit 0
 * silently. Fail-safe: any internal error → exit 0. A project without an index is left
 * alone — nothing is created there.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareIndex, selectPaths } from "../../skills/kb-index/scripts/lib/kb-core.mjs";
import {
  computeHash,
  gitRoot,
  listMarkdownFiles,
  readConfig,
  readDoc,
  readIndex,
} from "../../skills/kb-index/scripts/lib/kb-fs.mjs";

/** The plugin root: the repository root (hooks/lib sits two levels below it). */
const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  if (payload?.stop_hook_active === true) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: "kb-index: already continuing after a block — the index check is skipped.",
        },
      }),
    );
    process.exit(0);
  }

  const cwd = String(payload?.cwd || process.cwd());
  const projectDir = process.env.CLAUDE_PROJECT_DIR || gitRoot(cwd) || cwd;

  const index = readIndex(projectDir);
  if (!index) process.exit(0);

  const config = readConfig(projectDir);
  const disk = selectPaths(listMarkdownFiles(projectDir), config).map((path) => ({
    path,
    hash: computeHash(readDoc(projectDir, path)),
  }));

  const { changed, added, missing } = compareIndex(index, disk);
  if (!changed.length && !added.length && !missing.length) process.exit(0);

  const cli = join(PLUGIN_ROOT, "skills", "kb-index", "scripts", "kb.mjs");
  console.log(
    JSON.stringify({
      decision: "block",
      reason:
        `kb-index: documentation index is stale (${changed.length} changed, ${added.length} added, ` +
        `${missing.length} removed). Rebuild it: node "${cli}" build --project "${projectDir}"`,
    }),
  );
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
