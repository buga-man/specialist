#!/usr/bin/env node
/**
 * Claude Code hook, two registrations (see hooks.json):
 *   - PreToolUse (Bash): `git commit` → semgrep scan of the staged files; findings
 *     block the commit (exit 2, reason on stderr).
 *   - PostToolUse (Edit/Write/MultiEdit): when the project's .vuln-guard mode is
 *     "always", the edited file is scanned; findings go back to the agent (exit 2).
 * No semgrep on PATH / clean scan / broken scanner / any internal error → exit 0
 * silently (fail-safe: the hook never blocks legitimate work).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkGitCommit, readVulnMode, scanSingleFile } from "./vuln-core.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

try {
  const tool = String(payload?.tool_name || "");
  const projectDir = String(payload?.cwd || process.cwd());
  const run = (cmd, args, opts) => {
    const r = spawnSync(cmd, args, { ...opts, encoding: "utf8", windowsHide: true });
    return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };

  if (/^bash$/i.test(tool)) {
    const command = String(payload?.tool_input?.command || "");
    if (command) {
      const result = await checkGitCommit({ projectDir, command, run });
      if (result) {
        console.error(result.reason);
        process.exit(2);
      }
    }
  } else if (/^(Edit|Write|MultiEdit)$/i.test(tool)) {
    const filePath = String(payload?.tool_input?.file_path || "");
    if (filePath && readVulnMode(projectDir) === "always") {
      const result = await scanSingleFile({ projectDir, filePath, run });
      if (result) {
        console.error(result.reason);
        process.exit(2);
      }
    }
  }
} catch {
  /* fail-safe: never block on hook errors */
}
process.exit(0);
