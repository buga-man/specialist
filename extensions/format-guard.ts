/**
 * format-guard — pi extension, twin of the Claude Code hook (hooks/lib/format-guard.mjs).
 *
 * After a successful edit/write, runs the project's own formatter (prettier for web
 * files when the project declares it in package.json, ruff for Python). Auto-fixes
 * what it can; if the formatter still reports errors (e.g. syntax), flags the tool
 * result as an error so the agent repairs the file immediately. No project formatter
 * or a non-code file → no-op.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { formatFile } from "../hooks/lib/format-core.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    try {
      if (event.toolName !== "edit" && event.toolName !== "write") return;
      if (event.isError) return;
      let filePath = (event.input as { path?: string } | undefined)?.path ?? "";
      if (!filePath) return;
      if (filePath.startsWith("@")) filePath = filePath.slice(1);
      const result = await formatFile({
        projectDir: ctx.cwd,
        filePath: resolve(ctx.cwd, filePath),
        run: (cmd, args, opts) => pi.exec(cmd, args, opts),
      });
      if (!result || result.ok) return;

      const text = (event.content ?? [])
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `${text}\n\nformat-guard (${result.tool}) could not format ${filePath} — fix the errors:\n` +
              result.output,
          },
        ],
      };
    } catch {
      /* fail-safe: never block on hook errors */
    }
  });
}
