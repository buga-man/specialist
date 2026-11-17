/**
 * suite-core.mjs — shared logic for the suite-gate hook.
 *
 * Runs the project's own test command where a red suite would become history — in a
 * commit — and blocks the commit when the command exits non-zero. The command comes
 * from the project opt-in file `.suite-gate` in the project root: its first line is the
 * command (`npm test`, `mix test`, …); no file, an empty one, or `off` — the gate is
 * silent. That opt-in is deliberate: a full suite costs minutes, so unlike the other
 * guards this one is never on by default.
 *
 * Design decisions:
 *   - Trigger: `git commit` only, the same boundary as vuln-guard. `git -C <dir>
 *     commit` operates on <dir>. A commit with an empty index (nothing staged) is
 *     skipped — the commit itself would fail; running the suite for it is waste.
 *   - Exit-code mapping: 0 = green (pass), non-zero = red suite → block with the tail
 *     of the output (failures live at the end). A spawn error or a timeout (status
 *     null) is uncertainty, not a red suite — fail-safe: no block, no noise.
 *   - The test command runs through an injected `runShell(commandLine, opts)` — the
 *     `.suite-gate` line is a shell command line, not argv — so every host picks its
 *     own shell (the Claude Code hook spawns one; pi reuses pi.exec).
 *
 * `run()` and `runShell()` are injected so the Claude Code hook (child_process) and
 * the pi extension (pi.exec) share this logic.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitStagesAll, gitCommands } from "./secrets-core.mjs";

/** The suite runs inside the hook; the manifest timeout (600 s) must stay above this. */
export const TEST_TIMEOUT_MS = 570000;

const MAX_OUTPUT = 1500;

/** Mode file `.suite-gate` in the project root: the test command line, or null when the
 *  gate is off (no file / empty / "off"). Only the first line is the command — the
 *  lines after it are free-form notes for the team. */
export function readSuiteGateCommand(projectDir) {
  try {
    const p = join(projectDir, ".suite-gate");
    if (!existsSync(p)) return null;
    const v = readFileSync(p, "utf8").trim();
    if (!v || v.toLowerCase() === "off") return null;
    return v.split(/\r?\n/)[0].trim() || null;
  } catch {
    return null; // fail-safe: an unreadable config is a silent gate
  }
}

/** The tail of the combined output — test failures report themselves at the end. */
function tail(s) {
  const text = `${s ?? ""}`.trim();
  return text.length > MAX_OUTPUT ? "…[truncated]\n" + text.slice(-MAX_OUTPUT) : text;
}

/** Whether the commit has content: an empty index (or the -a whole tracked delta) means
 *  git itself would refuse — the suite is not run for it. */
async function hasStagedChanges(dir, rest, run) {
  const args = commitStagesAll(rest)
    ? ["diff", "HEAD", "--quiet"]
    : ["diff", "--cached", "--quiet"];
  const r = await run("git", args, { cwd: dir, timeout: 15000 });
  return r.code !== 0; // 0 = no differences; anything else (including git errors) runs the suite
}

/**
 * Decide whether a shell command may run. Returns null (nothing to report) or
 * { reason }. Reacts to `git commit` only, and only when `.suite-gate` names a command.
 */
export async function checkGitCommit({ projectDir, command, run, runShell }) {
  const cmdline = readSuiteGateCommand(projectDir);
  if (!cmdline) return null;
  for (const { sub, rest, dir: cmdDir } of gitCommands(command)) {
    if (sub !== "commit") continue;
    const dir = cmdDir || projectDir;
    if (!(await hasStagedChanges(dir, rest, run))) continue;
    const r = await runShell(cmdline, { cwd: dir, timeout: TEST_TIMEOUT_MS });
    if (r.code === 0) return null; // green suite — the whole command line may proceed
    if (r.code === null || r.code === undefined) return null; // spawn error / timeout — fail-safe
    const output = tail(`${r.stdout}\n${r.stderr}`);
    return {
      reason:
        `suite-gate: the test command from .suite-gate failed (exit ${r.code}):\n` +
        `${cmdline}\n` +
        (output ? `${output}\n` : "(no output)\n") +
        "Fix the code or the tests before committing. If the failure predates this change, " +
        "report it to the user — the gate is theirs to lift (.suite-gate).",
    };
  }
  return null;
}
