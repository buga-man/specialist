/**
 * codestyle-fs.mjs — the file and git layer of the codestyle skill.
 *
 * Everything the pure core (codestyle-core.mjs) must not do: reading CODESTYLE.md
 * and asking git for the commits since the documented base. Shared by the
 * SessionStart hook (codestyle-reminder.mjs) and the CLI (scripts/codestyle.mjs),
 * so both see the same data — the same core/fs split the other skills follow.
 *
 * Fail-safe: a missing document reads as null, a git failure reads as null —
 * both callers stay silent on null (a reminder without honest data is noise).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The root of the git repository the directory belongs to, or null.
 *  Inlined (was re-exported from kb-fs.mjs): the kb cores live with the kb-index skill now. */
export function gitRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

/** The project root for the hook: CLAUDE_PROJECT_DIR, else the git root of cwd, else cwd. */
export function resolveProjectDir(cwd) {
  return process.env.CLAUDE_PROJECT_DIR || gitRoot(cwd) || cwd;
}

/** The text of CODESTYLE.md in the project root, or null when there is none. */
export function readCodestyleDoc(projectDir) {
  try {
    return readFileSync(join(projectDir, "CODESTYLE.md"), "utf8");
  } catch {
    return null;
  }
}

/**
 * The raw stdout of `git log --pretty=format:%x1e%H --name-only <base>..HEAD`
 * (parse it with parseGitLog), or null when git cannot answer — no repository,
 * an unknown base (rebase, shallow clone), any error.
 */
export function gitCommitsSince(projectDir, base) {
  const result = spawnSync(
    "git",
    ["log", "--pretty=format:%x1e%H", "--name-only", `${base}..HEAD`],
    { cwd: projectDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}
