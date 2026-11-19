#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (matcher "Bash"): auto-approves the provably read-only
 * commands (git status/log/diff/show/blame, git branch/remote listing, ls, cat, pwd,
 * test -e) — read-only, workspace-bound, no redirection or pipes. Everything else
 * gets no decision: the host's normal permission flow decides (fail-closed — a parse
 * doubt never widens what is auto-approved).
 *
 * Protocol: hook JSON on stdin; allow = exit 0 with the PreToolUse permissionDecision
 * JSON on stdout; no opinion = exit 0 silently. Never blocks, never denies.
 * ZCode speaks the same protocol and shares this adapter. Codex and pi have their own
 * approval mechanisms (Codex config prefixes, pi's permission prompts) and are not
 * wired to this hook — see docs/hooks.md, Host support.
 * Fail-safe: any internal error → exit 0 silently.
 */
import { decideApproval } from "./bash-policy-core.mjs";
import { readHookPayload } from "./hook-kit.mjs";

try {
  const payload = readHookPayload();
  if (/^bash$/i.test(String(payload?.tool_name || ""))) {
    const command = String(payload?.tool_input?.command || "");
    const verdict = decideApproval(command);
    if (verdict.decision === "allow") {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: verdict.reason,
          },
        }),
      );
    }
  }
} catch {
  /* fail-safe: never interfere on hook errors */
}
process.exit(0);
