/**
 * hook-kit.mjs — the shared kit for the thin host adapters (Claude Code and Codex).
 * One place for the boilerplate every adapter repeats: stdin payload parsing, the
 * child-process runner contract the cores expect, the project-directory resolution,
 * the Codex `additionalContext` JSON envelope and the plugin-root paths. The per-host
 * decision protocols (exit 2 + stderr vs JSON stdout) stay in the adapters.
 *
 * Fail-safe by contract: readHookPayload never throws — empty or garbage stdin reads
 * as {}, so an adapter's own logic decides what an empty payload means.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitRoot } from "../../skills/kb-index/scripts/lib/kb-fs.mjs";

/** The root of the plugin: the repository root (hooks/lib sits two levels below it). */
export const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The path of the kb.mjs CLI, for the rebuild command in the signals. */
export const KB_CLI = join(PLUGIN_ROOT, "skills", "kb-index", "scripts", "kb.mjs");

/** The hook payload from stdin: parsed JSON, or {} on empty/garbage stdin. */
export function readHookPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8")) || {};
  } catch {
    return {};
  }
}

/** The child-process runner contract every core expects: { code, stdout, stderr }. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { ...opts, encoding: "utf8", windowsHide: true });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** The project directory of a hook call, resolved the same way in every adapter:
 *  the host's project root when it says so (CLAUDE_PROJECT_DIR), else the git root of
 *  the session cwd, else the cwd itself. One resolution so the per-project lookups
 *  (.spec-gate, .secrets-allow, .vuln-guard, CODESTYLE.md, .kbindex) agree across
 *  hooks regardless of the session's working directory. */
export function resolveProjectDir(payload) {
  const cwd = String(payload?.cwd || process.cwd());
  return process.env.CLAUDE_PROJECT_DIR || gitRoot(cwd) || cwd;
}

/** The Codex PostToolUse/SessionStart envelope: the text becomes agent context
 *  (Codex PostToolUse is record-only, and plain stdout is not picked up there). */
export function codexContext(eventName, text) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
  });
}
