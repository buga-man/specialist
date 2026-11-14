/**
 * format-core.mjs — shared logic for the format-guard hook.
 *
 * Runs the project's own formatter on an edited file and reports failures.
 * Opinionated defaults:
 *   - Only runs tools the project itself uses: prettier must be declared in the
 *     project's package.json (a transitive copy in node_modules is ignored), ruff
 *     for Python. No project tool → skip silently.
 *   - Auto-fixes what it can (--write / ruff format); only unfixable errors
 *     (syntax problems) come back as a failure for the agent to repair.
 *
 * `run(cmd, args, opts)` is injected so both the Claude Code hook (child_process)
 * and the pi extension (pi.exec) can share this logic.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";

const PRETTIER_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte",
  ".css", ".scss", ".less", ".html", ".json", ".jsonc", ".yaml", ".yml",
]);

const MAX_OUTPUT = 2000;

function clip(s) {
  const text = `${s ?? ""}`.trim();
  return text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + " …[truncated]" : text;
}

/** True when the project itself declares prettier (dependencies or devDependencies) —
 *  a prettier that merely landed in node_modules transitively is ignored. Memoized per
 *  manifest stat: one patch payload formats several files, and re-reading package.json
 *  per file is waste. The stat key keeps a changed manifest honest (tests toggle it). */
let prettierMemo = null;
function projectDeclaresPrettier(projectDir) {
  const manifest = join(projectDir, "package.json");
  let stat = null;
  try {
    stat = statSync(manifest);
  } catch {
    /* no manifest — value is false */
  }
  const key = stat ? `${manifest}:${stat.mtimeMs}:${stat.size}` : `${manifest}:none`;
  if (prettierMemo?.key === key) return prettierMemo.value;
  let value = false;
  try {
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    value = Boolean(pkg?.dependencies?.prettier || pkg?.devDependencies?.prettier);
  } catch {
    value = false;
  }
  prettierMemo = { key, value };
  return value;
}

/**
 * Format filePath in projectDir using the injected run() helper.
 * Returns null (nothing to do / tool absent), or { ok, tool, output }.
 */
export async function formatFile({ projectDir, filePath, run }) {
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
    if (PRETTIER_EXTS.has(ext)) {
      if (!projectDeclaresPrettier(projectDir)) return null;
      const bin = [
        join(projectDir, "node_modules", "prettier", "bin", "prettier.cjs"), // prettier >= 3
        join(projectDir, "node_modules", "prettier", "bin-prettier.js"), // prettier 2
      ].find(existsSync);
      if (!bin) return null;
      const r = await run(process.execPath, [bin, "--write", filePath], {
        cwd: projectDir,
        timeout: 20000,
      });
      if (r.code === 0) return { ok: true, tool: "prettier", output: "" };
      return { ok: false, tool: "prettier", output: clip(`${r.stdout}\n${r.stderr}`) };
    }
    if (ext === ".py") {
      const attempts = [
        ["python", []],
        ["py", ["-3"]],
      ];
      for (const [cmd, base] of attempts) {
        const r = await run(cmd, [...base, "-m", "ruff", "format", filePath], {
          cwd: projectDir,
          timeout: 20000,
        });
        if (r.code == null) continue; // interpreter not found — try the next one
        if ((r.stderr || "").includes("No module named")) continue; // ruff missing here — try the next interpreter
        if (r.code === 0) return { ok: true, tool: "ruff", output: "" };
        return { ok: false, tool: "ruff", output: clip(`${r.stdout}\n${r.stderr}`) };
      }
      return null;
    }
  } catch {
    return null; // fail-safe: a broken formatter must not break the workflow
  }
  return null;
}
