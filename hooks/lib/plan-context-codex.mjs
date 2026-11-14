#!/usr/bin/env node
/**
 * Codex SessionStart hook: the plan-context twin for Codex. Prints the orientation block
 * as `additionalContext` JSON on stdout (Codex injects it into the session context —
 * plain stdout is not picked up there, unlike Claude Code).
 * Silent when there is nothing to say (no open plan, gate off) and on any internal error.
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
  if (text) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
      }),
    );
  }
} catch {
  /* fail-safe: orientation must never break the session */
}
process.exit(0);
