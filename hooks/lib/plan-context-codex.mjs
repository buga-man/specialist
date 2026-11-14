#!/usr/bin/env node
/**
 * Codex SessionStart hook: the plan-context twin for Codex. Prints the orientation block
 * as `additionalContext` JSON on stdout (Codex injects it into the session context —
 * plain stdout is not picked up there, unlike Claude Code).
 * Silent when there is nothing to say (no open plan, gate off) and on any internal error.
 */
import { buildPlanContext } from "./plan-context-core.mjs";
import { codexContext, readHookPayload, resolveProjectDir } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  const text = buildPlanContext(resolveProjectDir(payload));
  if (text) console.log(codexContext("SessionStart", text));
} catch {
  /* fail-safe: orientation must never break the session */
}
process.exit(0);
