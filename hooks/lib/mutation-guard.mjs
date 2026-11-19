#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (matcher "Bash"): blocks agent-run pushes and history
 * rewrites when the project opted in via `.spec-gate` (`mutation-guard: on`).
 * Commits are deliberately not gated — one task = one commit is the framework's own
 * loop (spec-implementation); what needs the user's explicit command is everything
 * that leaves the working tree or rewrites history.
 *
 * Protocol: hook JSON on stdin; block = exit code 2 with the reason on stderr
 * (Claude Code and ZCode feed it back to the agent), allow = exit 0 silently.
 * Codex accepts the same exit-2 protocol (registered by hooks/hooks-codex.json).
 * Opt-in: without `mutation-guard: on` in .spec-gate the hook is silent.
 * Fail-safe: unknown shapes and any internal error → exit 0 (never blocks work).
 */
import { readGateConfig } from "./spec-core.mjs";
import { decideMutation } from "./mutation-guard-core.mjs";
import { readHookPayload, resolveProjectDir } from "./hook-kit.mjs";

const payload = readHookPayload();

try {
  if (/^bash$/i.test(String(payload?.tool_name || ""))) {
    const command = String(payload?.tool_input?.command || "");
    if (command) {
      const { mutationGuard } = readGateConfig(resolveProjectDir(payload));
      if (mutationGuard) {
        const verdict = decideMutation(command);
        if (verdict) {
          console.error(verdict.reason);
          process.exit(2);
        }
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
