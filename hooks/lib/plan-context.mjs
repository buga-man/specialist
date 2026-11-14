#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: prints a short orientation block (active plan, open
 * tasks, spec-gate state) to stdout — Claude Code adds SessionStart stdout to the
 * session context, so a fresh session starts "in the know".
 * Silent when there is nothing to say (no open plan, gate off) and on any internal
 * error (fail-safe).
 */
import { readFileSync } from "node:fs";
import { buildPlanContext } from "./plan-context-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  payload = {};
}

try {
  const projectDir = String(payload?.cwd || process.cwd());
  const text = buildPlanContext(projectDir);
  if (text) console.log(text);
} catch {
  /* fail-safe: orientation must never break the session */
}
process.exit(0);
