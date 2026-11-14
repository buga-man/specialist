/**
 * lint-guard — pi extension, twin of the Claude Code hook (hooks/lib/lint-guard.mjs).
 *
 * After a successful edit/write, runs the project's own linter (eslint when the project
 * declares it in package.json, ruff check for Python, ktlint for Kotlin). Auto-fixes
 * what it can; remaining violations flag the tool result as an error so the agent
 * repairs the file immediately. No project linter or a non-code file → no-op.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { lintFile } from "../hooks/lib/lint-core.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    if (event.isError) return;
    let filePath = (event.input as { path?: string } | undefined)?.path ?? "";
    if (!filePath) return;
    if (filePath.startsWith("@")) filePath = filePath.slice(1);
    const result = await lintFile({
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
            `${text}\n\nlint-guard (${result.tool}) reports violations in ${filePath} — fix the errors:\n` +
            result.output,
        },
      ],
    };
  });
}
