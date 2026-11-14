#!/usr/bin/env node
/**
 * Codex Stop hook: the kb-gate twin for Codex. Keeps the documentation index in sync
 * with the disk: when a document changed, was added or removed after the last build,
 * the end of the turn is blocked with a rebuild command (naming the worst offenders).
 * Codex Stop reads the block decision from stdout JSON ({"decision": "block",
 * "reason": "…"}) — Claude Code uses exit 2 with stderr, hence this dedicated adapter.
 * The reconcile itself is kb-gate-core.mjs, shared with the Claude Code gate.
 *
 * Protocol: hook JSON on stdin; block = the JSON above on stdout; allow = exit 0
 * silently. Fail-safe: any internal error → exit 0. A project without an index is left
 * alone — nothing is created there.
 */
import { codexContext, KB_CLI, readHookPayload, resolveProjectDir } from "./hook-kit.mjs";
import { indexStaleness, stalenessDetail } from "./kb-gate-core.mjs";

const payload = readHookPayload();

try {
  if (payload?.hook_event_name && payload.hook_event_name !== "Stop") process.exit(0);
  if (payload?.stop_hook_active === true) {
    console.log(
      codexContext("Stop", "kb-index: already continuing after a block — the index check is skipped."),
    );
    process.exit(0);
  }

  const projectDir = resolveProjectDir(payload);
  const staleness = indexStaleness(projectDir);
  if (!staleness) process.exit(0);

  const parts = [
    staleness.changed.length ? `changed: ${stalenessDetail(staleness.changed)}` : null,
    staleness.added.length ? `added: ${stalenessDetail(staleness.added)}` : null,
    staleness.missing.length ? `removed: ${stalenessDetail(staleness.missing)}` : null,
  ].filter(Boolean);
  console.log(
    JSON.stringify({
      decision: "block",
      reason:
        `kb-index: documentation index is stale (${parts.join("; ")}). ` +
        `Rebuild it: node "${KB_CLI}" build --project "${projectDir}"`,
    }),
  );
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
