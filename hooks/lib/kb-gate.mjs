#!/usr/bin/env node
/**
 * Claude Code Stop hook: keeps the documentation index in sync with the disk.
 *
 * The index lives in .kbindex/ of the project and is built by
 * skills/kb-index/scripts/kb.mjs. When a document changed, was added or removed
 * after the last build, the hook blocks the end of the turn and tells the agent
 * how to rebuild the index (naming the worst offenders). The reconcile itself is
 * kb-gate-core.mjs — the same verdict the Codex gate and the git-watch signal use.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code feeds it back to the agent), allow = exit 0 silently.
 * Fail-safe: any internal error → exit 0 (the hook never blocks legitimate work).
 * A project without an index is left alone — nothing is created there.
 */
import { readHookPayload, KB_CLI, resolveProjectDir } from "./hook-kit.mjs";
import { indexStaleness, stalenessDetail } from "./kb-gate-core.mjs";

const payload = readHookPayload();

try {
  if (payload?.hook_event_name !== "Stop") process.exit(0);
  if (payload?.stop_hook_active === true) {
    console.error("kb-index: already continuing after a block — the index check is skipped.");
    process.exit(0);
  }

  const staleness = indexStaleness(resolveProjectDir(payload));
  if (!staleness) process.exit(0);

  const parts = [
    staleness.changed.length ? `changed: ${stalenessDetail(staleness.changed)}` : null,
    staleness.added.length ? `added: ${stalenessDetail(staleness.added)}` : null,
    staleness.missing.length ? `removed: ${stalenessDetail(staleness.missing)}` : null,
  ].filter(Boolean);
  console.error(
    `kb-index: documentation index is stale (${parts.join("; ")}). ` +
      `Rebuild it: node "${KB_CLI}" build --project "${resolveProjectDir(payload)}"`,
  );
  process.exit(2);
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
