/**
 * specialist — OpenCode plugin (V2 API with a V1 `server()` fallback), the twin of the
 * Claude Code / Codex hook adapters. One logic, four hosts; the cores live in
 * `hooks/lib/*.mjs` and are imported directly.
 *
 * Mapping (tool names are OpenCode's):
 *   - `tool.execute.before` / `execute.before`
 *       bash          → secrets-guard (git boundary) + vuln-guard (commit scan);
 *                       a violation throws, which is OpenCode's way to block a tool call.
 *       edit / write  → spec-gate: the plan scope (docs/plans/) is enforced on
 *                       `args.filePath`.
 *   - `tool.execute.after` / `execute.after`
 *       bash          → git-watch: after a tree-changing git operation, a staleness
 *                       signal for the derived artifacts is appended to the tool output.
 *       edit / write  → format-guard + lint-guard (project tools), vuln-guard edit scan
 *                       under `.vuln-guard = always`; failures surface as tool errors.
 *   - `context` (V2) / `chat.message` (V1)
 *                     → plan-context: a fresh session starts oriented (open plan, open
 *                       tasks, spec-gate mode); injected once per session.
 *
 * Fail-safe by construction: guard failures (broken configs, missing tools) never block
 * legitimate work — only explicit violations throw.
 */
import { Plugin } from "@opencode/plugin";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { applyPatchPaths, decide, readMode } from "../../hooks/lib/spec-core.mjs";
import { checkGitCommand } from "../../hooks/lib/secrets-core.mjs";
import { checkGitCommit, readVulnMode, scanSingleFile } from "../../hooks/lib/vuln-core.mjs";
import { formatFile } from "../../hooks/lib/format-core.mjs";
import { lintFile } from "../../hooks/lib/lint-core.mjs";
import { buildPlanContext } from "../../hooks/lib/plan-context-core.mjs";
import { treeChangingCommands } from "../../hooks/lib/git-watch-core.mjs";
import { touchedProjectDirs, watchSignal } from "../../hooks/lib/git-watch-host.mjs";

/** Child-process runner matching the contract every core expects. */
const run = (cmd: string, args: string[], opts: Record<string, unknown>) => {
  const r = spawnSync(cmd, args, { ...opts, encoding: "utf8" } as never);
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** The target file of an edit-style tool call (`filePath` in OpenCode, `file_path`
 *  elsewhere; models sometimes prefix an `@`). Empty string when absent. */
function filePathOf(args: any): string {
  const p = String(args?.filePath ?? args?.file_path ?? "");
  return p.startsWith("@") ? p.slice(1) : p;
}

/** Everything an edit-style payload touches: the explicit file, or every file of an
 *  apply_patch-style patch (a defensive extra for hosts that send patches here). */
function editedFiles(args: any): string[] {
  const fp = filePathOf(args);
  if (fp) return [fp];
  return applyPatchPaths(args?.patchText ?? args?.patch ?? args) ?? [];
}

/** Before a tool call: the blocking guards. Throws the violation reason — OpenCode
 *  surfaces a thrown hook error as the tool failure the agent must react to. */
async function guardBefore(projectDir: string, tool: string, args: any): Promise<void> {
  let blockReason: string | null = null;
  try {
    if (tool === "bash") {
      const command = String(args?.command || "");
      if (command) {
        const secrets = await checkGitCommand({ projectDir, command, run });
        if (secrets) blockReason = secrets.reason;
        else {
          const vuln = await checkGitCommit({ projectDir, command, run });
          if (vuln) blockReason = vuln.reason;
        }
      }
    } else if (tool === "edit" || tool === "write" || tool === "patch") {
      for (const fp of editedFiles(args)) {
        const verdict = decide({ projectDir, filePath: resolve(projectDir, fp), mode: readMode(projectDir) });
        if (verdict.action === "block") {
          blockReason = verdict.reason;
          break;
        }
      }
    }
  } catch {
    /* fail-safe: a broken guard must never block legitimate work */
  }
  if (blockReason) throw new Error(blockReason);
}

/** After an edit-style tool call: format, lint, and (opt-in) the semgrep edit scan.
 *  Failures throw — the agent repairs the file immediately. */
async function afterEdit(projectDir: string, tool: string, args: any): Promise<void> {
  const failure: string[] = [];
  try {
    for (const fp of editedFiles(args)) {
      const abs = resolve(projectDir, fp);
      const formatted = await formatFile({ projectDir, filePath: abs, run });
      if (formatted && !formatted.ok) {
        failure.push(`format-guard (${formatted.tool}) could not format ${fp} — fix the errors:\n${formatted.output}`);
        continue;
      }
      const linted = await lintFile({ projectDir, filePath: abs, run });
      if (linted && !linted.ok) {
        failure.push(`lint-guard (${linted.tool}) reports violations in ${fp} — fix the errors:\n${linted.output}`);
        continue;
      }
      if (readVulnMode(projectDir) === "always") {
        const scanned = await scanSingleFile({ projectDir, filePath: abs, run });
        if (scanned) failure.push(scanned.reason);
      }
    }
  } catch {
    /* fail-safe: a broken formatter/linter must never break the workflow */
  }
  if (failure.length) throw new Error(failure.join("\n\n"));
}

/** After a bash tool call: the git-watch signal for derived artifacts (stale kb-index,
 *  stale CODESTYLE.md). The signal is appended to the tool output — defensive about the
 *  result shape, which differs between the V1 and V2 plugin APIs. */
async function watchAfterBash(projectDir: string, args: any, container: any): Promise<void> {
  const command = String(args?.command || "");
  const commands = treeChangingCommands(command);
  if (!commands.length) return;
  for (const dir of touchedProjectDirs(commands, projectDir)) {
    const message = watchSignal(dir);
    if (!message) continue;
    appendSignal(container, message);
  }
}

function appendSignal(container: any, text: string): void {
  if (!container) return;
  if (typeof container.result === "object" && container.result !== null) container = container.result;
  if (typeof container.output === "string") container.output += `\n\n${text}`;
  else if (Array.isArray(container.output)) container.output.push({ type: "text", text });
  else if (Array.isArray(container.parts)) container.parts.push({ type: "text", text });
  else if (typeof container.content === "string") container.content += `\n\n${text}`;
  else if (Array.isArray(container.content)) container.content.push({ type: "text", text });
  else container.metadata = { ...(container.metadata ?? {}), specialist: text };
  console.error(text);
}

/** The plan-context orientation, injected once per session. */
const oriented = new Set<string>();
function orientationOnce(key: unknown, push: (text: string) => void, projectDir: string): void {
  const keyText = String(key ?? "session");
  if (oriented.has(keyText)) return;
  const text = buildPlanContext(projectDir);
  if (!text) return; // no plan (yet) — check again on the next run
  oriented.add(keyText);
  push(text);
}

const projectDirOf = (ctx: any): string =>
  String(ctx?.location?.directory ?? ctx?.directory ?? ctx?.project?.directory ?? process.cwd());

/** The V2 plugin definition (OpenCode's current API). */
const definition = Plugin.define({
  id: "specialist",
  async setup(ctx) {
    const projectDir = projectDirOf(ctx);

    await ctx.session.hook("context", (event: any) => {
      orientationOnce(event?.sessionID ?? event?.messageID, (text) => {
        event.system.push({ type: "text", text });
      }, projectDir);
    });

    await ctx.tool.hook("execute.before", async (event: any) => {
      await guardBefore(projectDir, String(event?.tool ?? ""), event?.input);
    });

    await ctx.tool.hook("execute.after", async (event: any) => {
      const tool = String(event?.tool ?? "");
      if (tool === "bash") {
        await watchAfterBash(projectDir, event?.input, event);
        return;
      }
      if (tool === "edit" || tool === "write" || tool === "patch") {
        await afterEdit(projectDir, tool, event?.input);
      }
    });
  },
});

/** The V1 hooks object (supported by OpenCode 1.18.29+; harmless in V2). */
async function server(ctx: any) {
  const projectDir = projectDirOf(ctx);
  return {
    "chat.message": async (input: any, output: any) => {
      orientationOnce(input?.sessionID, (text) => {
        output?.parts?.push({ type: "text", text });
      }, projectDir);
    },
    "tool.execute.before": async (input: any, output: any) => {
      await guardBefore(projectDir, String(input?.tool ?? ""), output?.args);
    },
    "tool.execute.after": async (input: any, output: any) => {
      const tool = String(input?.tool ?? "");
      if (tool === "bash") {
        await watchAfterBash(projectDir, output?.args, output);
        return;
      }
      if (tool === "edit" || tool === "write" || tool === "patch") {
        await afterEdit(projectDir, tool, output?.args);
      }
    },
  };
}

/** Dual export: V2 reads `id`/`setup()`, V1 calls `server()`. */
export default {
  ...definition,
  server,
};
