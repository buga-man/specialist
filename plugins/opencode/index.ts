/**
 * specialist — OpenCode plugin (V2 API with a V1 `server()` fallback), the twin of the
 * Claude Code / Codex hook adapters. One logic, five hosts; the cores live in
 * `hooks/lib/*.mjs` and are imported directly.
 *
 * Mapping (tool names are OpenCode's):
 *   - `tool.execute.before` / `execute.before`
 *       bash          → secrets-guard (git boundary) + vuln-guard (commit scan) +
 *                       suite-gate (the .suite-gate suite before a commit);
 *                       a violation throws, which is OpenCode's way to block a tool call.
 *       edit / write  → spec-gate: the plan scope (docs/plans/) is enforced on the
 *                       payload's target files.
 *   - `tool.execute.after` / `execute.after`
 *       failed calls  → skipped (V2, which sees the call's status): a failed edit or a
 *                       failed git command changed nothing, so post-edit guards and
 *                       staleness signals would only mislead.
 *       bash          → git-watch: after a tree-changing git operation, a staleness
 *                       signal for the derived artifacts is appended to the tool output.
 *       edit / write  → edit-guard: boundary-visibility notes, then format-guard +
 *                       lint-guard (project tools), then the vuln-guard edit scan under
 *                       `.vuln-guard = always` — one handler, one deterministic order;
 *                       failures surface as tool errors, notes join the tool output.
 *   - `context` (V2) / `chat.message` (V1)
 *                     → plan-context: a fresh session starts oriented (open plan, open
 *                       tasks, spec-gate mode) and hears about a stale CODESTYLE.md;
 *                       injected once per session, re-injected after a compaction wiped
 *                       the context (V2 `compaction` hook).
 *
 * Fail-safe by construction: guard failures (broken configs, missing tools) never block
 * legitimate work — only explicit violations throw.
 */
import { Plugin } from "@opencode/plugin";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { decide, editedFilePaths, readMode, scopeChangeNotes } from "../../hooks/lib/spec-core.mjs";
import { checkGitCommand } from "../../hooks/lib/secrets-core.mjs";
import { checkGitCommit, readVulnMode, scanEditedFiles } from "../../hooks/lib/vuln-core.mjs";
import { checkGitCommit as checkSuiteGateCommit } from "../../hooks/lib/suite-core.mjs";
import { formatFile } from "../../hooks/lib/format-core.mjs";
import { lintFile } from "../../hooks/lib/lint-core.mjs";
import { buildPlanContext } from "../../hooks/lib/plan-context-core.mjs";
import { treeChangingCommands } from "../../hooks/lib/git-watch-core.mjs";
import { codestyleState, touchedProjectDirs, watchSignal } from "../../hooks/lib/git-watch-host.mjs";
import { reminderLine } from "../../skills/codestyle/scripts/lib/codestyle-core.mjs";
import { gitRoot } from "../../skills/kb-index/scripts/lib/kb-fs.mjs";

/** Child-process runner matching the contract every core expects. */
const run = (cmd: string, args: string[], opts: Record<string, unknown>) => {
  const r = spawnSync(cmd, args, { ...opts, encoding: "utf8" } as never);
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** The shell-line runner for config-file command lines (`.suite-gate`) — the platform
 *  shell sorts out quoting and `&&` for them. */
const runShell = (commandLine: string, opts: Record<string, unknown>) => {
  const r = spawnSync(String(commandLine), {
    ...opts,
    shell: true,
    encoding: "utf8",
    windowsHide: true,
  } as never);
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** The shapes the guards actually read from a tool payload. */
interface EditInput {
  command?: string;
  filePath?: string;
  file_path?: string;
  patchText?: string;
  patch?: string;
  [key: string]: unknown;
}
interface AfterEvent {
  tool?: string;
  input?: EditInput;
  status?: string;
  [key: string]: unknown;
}

/** Everything an edit-style payload touches, through the shared core helper (the
 *  camelCase `filePath`, the leading `@`, and patch payloads are all handled there). */
function editedFiles(args: EditInput | undefined): string[] {
  return editedFilePaths(args ?? {});
}

/** Before a tool call: the blocking guards. Throws the violation reason — OpenCode
 *  surfaces a thrown hook error as the tool failure the agent must react to. */
async function guardBefore(projectDir: string, tool: string, args: EditInput | undefined): Promise<void> {
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
          else {
            const tests = await checkSuiteGateCommit({ projectDir, command, run, runShell });
            if (tests) blockReason = tests.reason;
          }
        }
      }
    } else if (tool === "edit" || tool === "write" || tool === "patch") {
      const mode = readMode(projectDir);
      for (const fp of editedFiles(args)) {
        const verdict = decide({ projectDir, filePath: resolve(projectDir, fp), mode });
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

/** After an edit-style tool call: the boundary-visibility notes, then format, lint, and
 * (opt-in) the semgrep edit scan — one semgrep invocation for the whole payload. Every
 * check runs even when the previous one failed (no short-circuit). Failures throw — the
 * agent repairs the file immediately; notes without failures are appended to the tool
 * output (the same appendSignal channel git-watch uses). */
async function afterEdit(projectDir: string, args: EditInput | undefined, container: any): Promise<void> {
  const failure: string[] = [];
  let notes: string[] = [];
  try {
    notes = scopeChangeNotes(args ?? {}, projectDir);
    const files = editedFiles(args);
    for (const fp of files) {
      const result = await formatFile({ projectDir, filePath: resolve(projectDir, fp), run });
      if (result && !result.ok) {
        failure.push(`format-guard (${result.tool}) could not format ${fp} — fix the errors:\n${result.output}`);
      }
    }
    for (const fp of files) {
      const linted = await lintFile({ projectDir, filePath: resolve(projectDir, fp), run });
      if (linted && !linted.ok) {
        failure.push(`lint-guard (${linted.tool}) reports violations in ${fp} — fix the errors:\n${linted.output}`);
      }
    }
    if (readVulnMode(projectDir) === "always") {
      const scanned = await scanEditedFiles({
        projectDir,
        files: files.map((fp) => resolve(projectDir, fp)),
        run,
      });
      if (scanned) failure.push(scanned.reason);
    }
  } catch {
    /* fail-safe: a broken formatter/linter must never break the workflow */
  }
  if (failure.length) throw new Error([...failure, ...notes].join("\n\n"));
  if (notes.length) appendSignal(container, notes.join("\n\n"));
}

/** After a bash tool call: the git-watch signal for derived artifacts (stale kb-index,
 *  stale CODESTYLE.md). The signal is appended to the tool output — defensive about the
 *  result shape, which differs between the V1 and V2 plugin APIs. */
async function watchAfterBash(projectDir: string, args: EditInput | undefined, container: any): Promise<void> {
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
  else console.error(text); // unknown shape — the log is the last honest channel
}

/** The plan-context orientation plus the codestyle reminder, injected once per session. */
const oriented = new Set<string>();
function orientationOnce(key: unknown, push: (text: string) => void, projectDir: string): void {
  const keyText = String(key ?? "session");
  if (oriented.has(keyText)) return;
  const parts: string[] = [];
  const plan = buildPlanContext(projectDir);
  if (plan) parts.push(plan);
  try {
    const verdict = codestyleState(projectDir);
    if (verdict) parts.push(reminderLine(verdict));
  } catch {
    /* fail-safe: a broken reminder must never break the orientation */
  }
  if (!parts.length) return; // nothing to say (yet) — check again on the next run
  oriented.add(keyText);
  push(parts.join("\n\n"));
}

/** The project directory: what the host declared, else the git root of the cwd, else the
 *  cwd (the Claude Code chain without its env variable — a start in a subdirectory still
 *  finds the repository root). Resolved once at setup: an OpenCode plugin instance
 *  serves one project; a directory switch means a new instance (and thus a new setup). */
const projectDirOf = (ctx: any): string => {
  const declared = ctx?.location?.directory ?? ctx?.directory ?? ctx?.project?.directory;
  return declared ? String(declared) : gitRoot(process.cwd()) || process.cwd();
};

/** The V2 plugin definition (OpenCode's current API). */
const definition = Plugin.define({
  id: "specialist",
  async setup(ctx) {
    const projectDir = projectDirOf(ctx);

    await ctx.session.hook("context", (event: any) => {
      try {
        orientationOnce(event?.sessionID ?? event?.messageID, (text) => {
          event.system.push({ type: "text", text });
        }, projectDir);
      } catch {
        /* fail-safe: orientation is a nice-to-have, never a burden */
      }
    });

    // A compaction wipes the context — the orientation must come back afterwards.
    try {
      await ctx.session.hook("compaction", (event: any) => {
        oriented.delete(String(event?.sessionID ?? ""));
      });
    } catch {
      /* a host without the compaction hook simply keeps the inject-once behavior */
    }

    await ctx.tool.hook("execute.before", async (event: any) => {
      await guardBefore(projectDir, String(event?.tool ?? ""), event?.input);
    });

    await ctx.tool.hook("execute.after", async (event: any) => {
      const e = event as AfterEvent;
      if (e?.status && e.status !== "completed") return; // a failed call changed nothing
      const tool = String(e?.tool ?? "");
      if (tool === "bash") {
        await watchAfterBash(projectDir, e?.input, event);
        return;
      }
      if (tool === "edit" || tool === "write" || tool === "patch") {
        await afterEdit(projectDir, e?.input, event);
      }
    });
  },
});

/** The V1 hooks object (supported by OpenCode 1.18.29+; harmless in V2).
 *
 *  V1's `execute.after` payload carries no tool arguments (its input is
 *  { tool, sessionID, callID } and its output is { title, output, metadata } —
 *  `args` exists only on `execute.before`'s output). The after-hooks therefore
 *  read the arguments captured in `before` under the same callID; a call that
 *  somehow skipped `before` sees no arguments and stays silent. V1 has no
 *  status field either, so the failed-call skip is V2's alone. */
async function server(ctx: any) {
  const projectDir = projectDirOf(ctx);
  const callArgs = new Map<string, any>();
  const argsOf = (input: any, output: any): EditInput | undefined =>
    callArgs.get(String(input?.callID ?? "")) ?? input?.args ?? output?.args;
  return {
    "chat.message": async (input: any, output: any) => {
      orientationOnce(input?.sessionID, (text) => {
        output?.parts?.push({ type: "text", text });
      }, projectDir);
    },
    "tool.execute.before": async (input: any, output: any) => {
      if (callArgs.size > 500) callArgs.clear(); // before-without-after must not leak forever
      callArgs.set(String(input?.callID ?? ""), output?.args);
      await guardBefore(projectDir, String(input?.tool ?? ""), output?.args);
    },
    "tool.execute.after": async (input: any, output: any) => {
      const key = String(input?.callID ?? "");
      const args = argsOf(input, output);
      callArgs.delete(key);
      const tool = String(input?.tool ?? "");
      if (tool === "bash") {
        await watchAfterBash(projectDir, args, output);
        return;
      }
      if (tool === "edit" || tool === "write" || tool === "patch") {
        await afterEdit(projectDir, args, output);
      }
    },
  };
}

/** Dual export: V2 reads `id`/`setup()`, V1 calls `server()`. */
export default {
  ...definition,
  server,
};
