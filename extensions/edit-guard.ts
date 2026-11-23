/**
 * edit-guard — pi extension, the merged twin of the Claude Code PostToolUse hook
 * (hooks/lib/edit-guard.mjs). After a successful edit/write it runs, in one handler and
 * one deterministic order: the boundary-visibility notes (a plan's "- Files:" scope
 * line, the guard allowlists — a boundary change must be seen, not pass silently), the
 * project's formatter, the project's linter (each auto-fixing what it can), and — under
 * `.vuln-guard = always` — a semgrep scan of the file. One handler instead of three
 * extensions: no concurrent formatter/linter writes on one file, and a guaranteed
 * format-then-lint order. Failures flag the tool result as an error (the agent repairs
 * the file immediately); notes alone are appended to the result text.
 *
 * Project dir: the resolveProjectDir chain without the host env variable — the git root
 * of the session cwd, else the cwd (a session opened in a subdirectory still finds the
 * root's package.json and node_modules).
 * Fail-safe: a broken tool or any internal error never breaks the workflow.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { formatFile } from "../hooks/lib/format-core.mjs";
import { lintFile } from "../hooks/lib/lint-core.mjs";
import { readVulnMode, scanSingleFile } from "../hooks/lib/vuln-core.mjs";
import { scopeChangeNotes } from "../hooks/lib/spec-core.mjs";
import { gitRoot } from "../skills/kb-index/scripts/lib/kb-fs.mjs";

/** The project directory of a session: the git root of the cwd, else the cwd. */
function resolveProjectDir(cwd: string): string {
  return gitRoot(cwd) || cwd;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    try {
      if (event.toolName !== "edit" && event.toolName !== "write") return;
      if (event.isError) return;
      let filePath = (event.input as { path?: string } | undefined)?.path ?? "";
      if (!filePath) return;
      if (filePath.startsWith("@")) filePath = filePath.slice(1);
      if (!filePath) return;

      const projectDir = resolveProjectDir(ctx.cwd);
      const abs = resolve(ctx.cwd, filePath);
      const run = (cmd: string, args: string[], opts: Record<string, unknown>) => pi.exec(cmd, args, opts);

      const notes = scopeChangeNotes(event.input ?? {}, projectDir);
      const failures: string[] = [];
      const formatted = await formatFile({ projectDir, filePath: abs, run });
      if (formatted && !formatted.ok) {
        failures.push(
          `format-guard (${formatted.tool}) could not format ${filePath} — fix the errors:\n${formatted.output}`,
        );
      }
      const linted = await lintFile({ projectDir, filePath: abs, run });
      if (linted && !linted.ok) {
        failures.push(`lint-guard (${linted.tool}) reports violations in ${filePath} — fix the errors:\n${linted.output}`);
      }
      if (readVulnMode(projectDir) === "always") {
        const scanned = await scanSingleFile({ projectDir, filePath: abs, run });
        if (scanned) failures.push(scanned.reason);
      }

      const text = (event.content ?? [])
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");
      if (failures.length) {
        const tail = [...failures, ...notes].join("\n\n");
        return { isError: true, content: [{ type: "text", text: `${text}\n\n${tail}` }] };
      }
      if (notes.length) {
        return { content: [{ type: "text", text: `${text}\n\n${notes.join("\n\n")}` }] };
      }
    } catch {
      /* fail-safe: never break the workflow on hook errors */
    }
  });
}
