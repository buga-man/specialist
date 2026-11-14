/**
 * lint-core.mjs — shared logic for the lint-guard hook.
 *
 * Runs the project's own linter on an edited file and reports what --fix could not
 * repair. Opinionated defaults, mirroring format-core:
 *   - Only runs tools the project itself uses: eslint must be declared in the project's
 *     package.json (a transitive copy in node_modules is ignored), ruff for Python,
 *     ktlint for Kotlin (declared in a Gradle build file AND resolvable as a command).
 *     No project tool → skip silently (null).
 *   - Auto-fixes what it can (--fix / --format); remaining violations come back as a
 *     failure for the agent to repair.
 *   - Exit-code mapping: 0 = clean, 1 = violations left (returned to the agent),
 *     anything else = tooling trouble (config broken, interpreter missing) → skip
 *     silently. The guard must never turn a broken linter into a blocked edit.
 *
 * Kotlin note: ktlint is a JVM binary — 1–3 s per invocation. It only runs when the
 * project declares it; teams that find it slow can drop the ktlint line from their
 * build file or shadow the command.
 *
 * `run()` is injected so both the Claude Code hook (child_process) and the pi extension
 * (pi.exec) can share this logic.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";

const ESLINT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);
const KTLINT_EXTS = new Set([".kt", ".kts"]);

const MAX_OUTPUT = 2000;

function clip(s) {
  const text = `${s ?? ""}`.trim();
  return text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + " …[truncated]" : text;
}

/** Unified exit-code mapping for linters: 0 clean, 1 violations, else tooling trouble. */
function fromCode(tool, r) {
  if (r.code === 0) return { ok: true, tool, output: "" };
  if (r.code === 1) return { ok: false, tool, output: clip(`${r.stdout}\n${r.stderr}`) };
  return null; // fatal/config error — fail-safe, skip
}

/** The stat key of the files that decide a declaration — the memo basis. One patch
 *  payload lints several files; re-reading the manifests per file is waste, and the
 *  stat keys keep a changed manifest honest (tests toggle them). */
function statKey(projectDir, files) {
  const keys = [];
  for (const f of files) {
    try {
      const stat = statSync(join(projectDir, f));
      keys.push(`${f}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      keys.push(`${f}:none`);
    }
  }
  return keys.join("|");
}

let eslintMemo = null;
function projectDeclaresEslint(projectDir) {
  const key = statKey(projectDir, ["package.json"]);
  if (eslintMemo?.key === key) return eslintMemo.value;
  let value = false;
  try {
    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
    value = Boolean(pkg?.dependencies?.eslint || pkg?.devDependencies?.eslint);
  } catch {
    value = false;
  }
  eslintMemo = { key, value };
  return value;
}

const GRADLE_FILES = ["build.gradle.kts", "build.gradle", "settings.gradle.kts", "settings.gradle"];
let ktlintMemo = null;
function projectDeclaresKtlint(projectDir) {
  const key = statKey(projectDir, GRADLE_FILES);
  if (ktlintMemo?.key === key) return ktlintMemo.value;
  let value = false;
  for (const f of GRADLE_FILES) {
    try {
      const p = join(projectDir, f);
      if (existsSync(p) && /ktlint/.test(readFileSync(p, "utf8"))) {
        value = true;
        break;
      }
    } catch {
      /* keep looking */
    }
  }
  ktlintMemo = { key, value };
  return value;
}

/**
 * Lint filePath in projectDir using the injected run() helper.
 * Returns null (nothing to do / tool absent / tooling trouble), or { ok, tool, output }.
 */
export async function lintFile({ projectDir, filePath, run }) {
  let rel;
  try {
    rel = isAbsolute(filePath) ? relative(projectDir, filePath) : filePath;
  } catch {
    return null;
  }
  const relNorm = rel.replace(/\\/g, "/");
  if (!relNorm || relNorm.startsWith("..") || isAbsolute(relNorm)) return null;

  const ext = extname(filePath).toLowerCase();
  try {
    if (ESLINT_EXTS.has(ext)) {
      if (!projectDeclaresEslint(projectDir)) return null;
      const bin = join(projectDir, "node_modules", "eslint", "bin", "eslint.js");
      if (!existsSync(bin)) return null;
      const r = await run(process.execPath, [bin, "--fix", filePath], { cwd: projectDir, timeout: 20000 });
      if (r.code == null) return null;
      return fromCode("eslint", r);
    }
    if (ext === ".py") {
      const attempts = [
        ["python", []],
        ["py", ["-3"]],
      ];
      for (const [cmd, base] of attempts) {
        const r = await run(cmd, [...base, "-m", "ruff", "check", "--fix", filePath], {
          cwd: projectDir,
          timeout: 20000,
        });
        if (r.code == null) continue; // interpreter not found — try the next one
        if ((r.stderr || "").includes("No module named")) return null; // no ruff — skip
        return fromCode("ruff", r);
      }
      return null;
    }
    if (KTLINT_EXTS.has(ext)) {
      if (!projectDeclaresKtlint(projectDir)) return null;
      // Probe the binary first: ktlint on PATH varies (exe / .bat / wrapper script).
      for (const cmd of ["ktlint", "ktlint.bat"]) {
        const probe = await run(cmd, ["--version"], { cwd: projectDir, timeout: 15000 });
        if (probe.code == null) continue; // not found — try the next name
        if (probe.code !== 0) return null; // declared but broken — skip
        const r = await run(cmd, ["--format", filePath], { cwd: projectDir, timeout: 60000 });
        if (r.code == null) return null;
        return fromCode("ktlint", r);
      }
      return null;
    }
  } catch {
    return null; // fail-safe: a broken linter must not break the workflow
  }
  return null;
}
