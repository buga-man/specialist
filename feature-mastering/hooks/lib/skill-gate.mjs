#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (matcher "Skill"): in the `fast` SDD profile
 * (.spec-gate) the full-pipeline stage skills (brainstorm, system-thinking,
 * decompositor) are blocked from autonomous runs — the user can still run them
 * explicitly (the block message says how). Every other mode allows everything.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code feeds it back to the agent), allow = exit 0 silently.
 * Fail-safe: unknown skill names and unknown input shapes read as allow; garbage
 * stdin → payload = {}; any internal error → exit 0 (the hook never blocks
 * legitimate work).
 */
import { readFileSync } from "node:fs";
import { readMode } from "./spec-core.mjs";
import { decide } from "./skill-gate-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  payload = {};
}

try {
  if (payload?.tool_name !== "Skill") process.exit(0);
  const skill = String(payload?.tool_input?.skill ?? payload?.tool_input?.command ?? "");
  if (!skill) process.exit(0); // unknown input shape — fail open

  const projectDir = String(payload?.cwd || process.cwd());
  const verdict = decide({ mode: readMode(projectDir), skill });
  if (verdict.action === "block") {
    console.error(verdict.reason);
    process.exit(2);
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
