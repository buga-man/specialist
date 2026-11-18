/**
 * codestyle-fs.mjs — the file and git layer of the codestyle skill.
 *
 * Everything the pure core (codestyle-core.mjs) must not do: reading CODESTYLE.md
 * and asking git for the commits since the documented base. Shared by the
 * session-start reminder (hooks/lib/codestyle-reminder.mjs) and the CLI (scripts/codestyle.mjs),
 * so both see the same data — the same core/fs split the other skills follow.
 *
 * Fail-safe: a missing document reads as null, a git failure reads as null —
 * both callers stay silent on null (a reminder without honest data is noise).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isCodeFile } from "./codestyle-core.mjs";

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
  // Fast path: base == HEAD (the usual case right after a rebuild). The full
  // --name-only log would cost a spawn and megabytes of output to answer
  // "nothing changed"; rev-list --count answers in bytes.
  const count = spawnSync("git", ["rev-list", "--count", `${base}..HEAD`], {
    cwd: projectDir,
    encoding: "utf8",
  });
  if (count.status === 0 && count.stdout.trim() === "0") return "";
  const result = spawnSync(
    "git",
    ["log", "--pretty=format:%x1e%H", "--name-only", `${base}..HEAD`],
    { cwd: projectDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

/** Directories the readability walk never enters: dependencies and build output are
 *  not the repo's own code, .kbindex is a derived artifact. Symlinked directories are
 *  not followed either (readdir Dirents report them as neither file nor directory). */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "vendor", "coverage", ".kbindex"]);

/** Every code file of the project with its line count: [{ path, lines }], paths
 *  relative to the project root with forward slashes. The "not markdown = code"
 *  heuristic is the same one staleness uses; unreadable files are skipped. */
export function walkCodeFiles(projectDir) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(projectDir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(relPath);
      } else if (entry.isFile() && isCodeFile(relPath)) {
        try {
          const lines = readFileSync(join(projectDir, relPath), "utf8").split(/\r?\n/).length;
          out.push({ path: relPath, lines });
        } catch {
          /* unreadable — skip, the facts stay honest about what they measured */
        }
      }
    }
  };
  walk("");
  return out;
}
