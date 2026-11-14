#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: prints a short orientation block (active plan, open
 * tasks, spec-gate state) to stdout — Claude Code adds SessionStart stdout to the
 * session context, so a fresh session starts "in the know".
 * Silent when there is nothing to say (no open plan, gate off) and on any internal
 * error (fail-safe).
 */
import { buildPlanContext } from "./plan-context-core.mjs";
import { readHookPayload, resolveProjectDir } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const text = buildPlanContext(resolveProjectDir(payload));
  if (text) console.log(text);
} catch {
  /* fail-safe: orientation must never break the session */
}
process.exit(0);
