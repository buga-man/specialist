/**
 * vuln-guard — pi extension, twin of the Claude Code hook (hooks/lib/vuln-guard.mjs).
 *
 * `git commit` → semgrep scan of the staged files, findings block the tool call.
 * With the project's .vuln-guard mode set to "always", successful edits/writes are
 * scanned too and findings flag the tool result as an error. No semgrep on PATH,
 * clean scan, broken scanner → pass-through (fail-safe).
 */
import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { checkGitCommit, readVulnMode, scanSingleFile } from "../hooks/lib/vuln-core.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;
    const command = String((event.input as { command?: string } | undefined)?.command || "");
    if (!command) return;
    const result = await checkGitCommit({
      projectDir: ctx.cwd,
      command,
      run: (cmd, args, opts) => pi.exec(cmd, args, opts),
    });
    if (result) {
      return { block: true, reason: result.reason };
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    if (event.isError) return;
    if (readVulnMode(ctx.cwd) !== "always") return;
    let filePath = (event.input as { path?: string } | undefined)?.path ?? "";
    if (!filePath) return;
    if (filePath.startsWith("@")) filePath = filePath.slice(1);
    const result = await scanSingleFile({
      projectDir: ctx.cwd,
      filePath: resolve(ctx.cwd, filePath),
      run: (cmd, args, opts) => pi.exec(cmd, args, opts),
    });
    if (!result) return;

    const text = (event.content ?? [])
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n");
    return {
      isError: true,
      content: [{ type: "text", text: `${text}\n\n${result.reason}` }],
    };
  });
}
