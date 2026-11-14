/**
 * spec-gate — pi extension, twin of the Claude Code hook (hooks/lib/spec-gate.mjs).
 *
 * Blocks edit/write of files that are outside the scope of the open plan's tasks
 * (docs/plans/*.md): a task is a "### Task ..."/"###  ..." section, closed by an
 * explicit "- Done:" line ("- :"/"- :" work too; "- [x]" checkboxes are
 * progress, never closure); editable files are the backticked paths on its
 * "- Files:"/"- :" line, globs honored.
 *
 * Mode: the ".spec-gate" file in the project root — "hard" also blocks code edits
 * when no plan exists, "off" disables the gate, absent = soft (gate only with a plan).
 * Docs (docs/**, *.md) are always allowed; the mode file itself is not exempt — with an
 * open plan the agent cannot change the gate mode without a plan task.
 * Parsing failures never block (fail-safe).
 */
import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { decide, readMode } from "../hooks/lib/spec-core.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("edit", event) && !isToolCallEventType("write", event)) return;
    const input = event.input as { path?: string };
    let filePath = input?.path ?? "";
    if (!filePath) return;
    if (filePath.startsWith("@")) filePath = filePath.slice(1); // models sometimes add it; built-ins strip it
    if (!filePath) return;
    const result = decide({
      projectDir: ctx.cwd,
      filePath: resolve(ctx.cwd, filePath),
      mode: readMode(ctx.cwd),
    });
    if (result.action === "block") {
      return { block: true, reason: result.reason };
    }
  });
}
