#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (matcher "Skill"): gates Skill calls by the .spec-gate
 * profiles. In the `fast` SDD profile the full-pipeline stage skills (brainstorm,
 * system-thinking, decompositor) are blocked from autonomous runs — the user can
 * still run them explicitly (the block message says how). With `role: <name>` pinned,
 * the other roles' skills are blocked until the user consents to a switch (the
 * message points to the dispatch protocol).
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code feeds it back to the agent), allow = exit 0 silently.
 * Fail-safe: unknown skill names and unknown input shapes read as allow; garbage
 * stdin → payload = {}; any internal error → exit 0 (the hook never blocks
 * legitimate work).
 */
import { readGateConfig } from "./spec-core.mjs";
import { decide } from "./skill-gate-core.mjs";
import { readHookPayload, resolveProjectDir } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  if (payload?.tool_name !== "Skill") process.exit(0);
  const skill = String(payload?.tool_input?.skill ?? payload?.tool_input?.command ?? "");
  if (!skill) process.exit(0); // unknown input shape — fail open

  const { mode, role } = readGateConfig(resolveProjectDir(payload));
  const verdict = decide({ mode, role, skill });
  if (verdict.action === "block") {
    console.error(verdict.reason);
    process.exit(2);
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
