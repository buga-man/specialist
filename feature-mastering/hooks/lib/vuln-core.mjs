/**
 * vuln-core.mjs — shared logic for the vuln-guard hook (semgrep engine).
 *
 * Runs semgrep where a vulnerability becomes permanent — in a commit — and, per project
 * opt-in, on every edit. Semgrep is an engine, not a requirement: when it is not on
 * PATH (`semgrep` or `python -m semgrep`, how pip installs it on any of the three
 * platforms) the hook is a no-op — the only cost is a few quick probe spawns per scan.
 *
 * Design decisions (agreed 2026-11-08):
 *   - Default trigger: `git commit` only — seconds of scan are invisible at the
 *     checkpoint, while per-edit scans tax every keystroke-sized change. Per-project
 *     mode file `.vuln-guard`: absent/garbage = commit-only, "always"/"edit" = also
 *     edits, "off" = the hook does nothing at all (commit included).
 *   - Rules: the project's own semgrep.yml / .semgrep.yml when present, otherwise
 *     p/security-audit plus language packs matched to the file extensions. The first
 *     registry fetch needs the network (cached by semgrep afterwards); a failed fetch
 *     degrades to silence — fail-safe.
 *   - Exit-code mapping: 0 = clean, 1 = findings (returned), anything else = broken
 *     scanner → silence. A broken scanner must never block a commit.
 *   - False-positive escapes: semgrep's native inline "# nosemgrep:<rule-id>" and the
 *     `.vuln-allow` file (one regex per line, matched against rule id or path).
 *
 * `run()` is injected so both the Claude Code hook (child_process) and the pi extension
 * (pi.exec) share this logic.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { commitStagesAll, gitCommands, readAllowlist } from "./secrets-core.mjs";

const MAX_FILES = 50;
const MAX_FINDINGS_SHOWN = 20;
const MAX_MESSAGE = 300;

/** Mode file `.vuln-guard` in the project root: commit (default) / always / off. */
export function readVulnMode(projectDir) {
  try {
    const p = join(projectDir, ".vuln-guard");
    if (existsSync(p)) {
      const v = readFileSync(p, "utf8").trim().toLowerCase();
      if (v === "always" || v === "edit") return "always";
      if (v === "off") return "off";
    }
  } catch {
    /* fall through to default */
  }
  return "commit";
}

/** Find the semgrep binary through the injected run(): first of `semgrep`,
 *  `python -m semgrep`, `py -3 -m semgrep` that answers --version with exit 0. */
export async function probeSemgrep(run) {
  const attempts = [
    ["semgrep", []],
    ["python", ["-m", "semgrep"]],
    ["py", ["-3", "-m", "semgrep"]],
  ];
  for (const [cmd, base] of attempts) {
    const r = await run(cmd, [...base, "--version"], { timeout: 15000 });
    if (r.code === 0) return { cmd, base };
  }
  return null;
}

/** Project-local ruleset wins; null means "use registry packs". */
export function resolveConfig(projectDir) {
  for (const f of ["semgrep.yml", ".semgrep.yml"]) {
    const p = join(projectDir, f);
    if (existsSync(p)) return p;
  }
  return null;
}

const LANG_PACKS = [
  [/\.py$/i, "p/python"],
  [/\.tsx?$/i, "p/typescript"],
  [/\.(js|jsx|mjs|cjs)$/i, "p/javascript"],
  [/\.(kt|kts)$/i, "p/kotlin"],
];

/** Registry packs for a file set: security-audit always, plus one pack per language seen. */
export function registryPacks(files) {
  const packs = new Set(["p/security-audit"]);
  for (const f of files) {
    for (const [re, pack] of LANG_PACKS) if (re.test(f)) packs.add(pack);
  }
  return [...packs];
}

/** Parse semgrep --json output into {rule, file, line, message} findings; garbage → []. */
export function parseSemgrepJson(text) {
  try {
    const data = JSON.parse(String(text));
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((r) => ({
      rule: String(r?.check_id ?? "?"),
      file: String(r?.path ?? "?"),
      line: Number(r?.start?.line ?? 0),
      message: String(r?.extra?.message ?? "").slice(0, MAX_MESSAGE),
    }));
  } catch {
    return []; // fail-safe: unparsable output is silence, not a block
  }
}

const clip = (s) => (s.length > MAX_MESSAGE ? s.slice(0, MAX_MESSAGE - 1) + "…" : s);

function findingsToReason(findings, what, truncated) {
  const rows = findings
    .slice(0, MAX_FINDINGS_SHOWN)
    .map((f) => `  - ${f.file}:${f.line} — ${f.rule} — ${clip(f.message)}`)
    .join("\n");
  const extra = truncated ? `\n(only the first ${MAX_FILES} staged files were scanned)` : "";
  return (
    `vuln-guard: semgrep found ${findings.length} potential vulnerability/ies in ${what}.\n${rows}${extra}\n` +
    "Fix the issue, or if the finding is a false positive: suppress it inline with " +
    "`# nosemgrep: <rule-id>` on the line, or add a matching regex for the rule id / path " +
    "to .vuln-allow in the project root."
  );
}

async function scanFiles({ projectDir, files, run, what }) {
  if (!files.length) return null;
  const engine = await probeSemgrep(run);
  if (!engine) return null; // no semgrep — nothing to scan with, stay silent

  const local = resolveConfig(projectDir);
  const configArgs = local ? ["--config", local] : registryPacks(files).flatMap((p) => ["--config", p]);
  const truncated = files.length > MAX_FILES;
  const r = await run(engine.cmd, [
    ...engine.base,
    "scan",
    "--json",
    "--quiet",
    ...configArgs,
    ...files.slice(0, MAX_FILES),
  ], { cwd: projectDir, timeout: 60000 });

  // Semgrep exits 0 even when it reports findings (only --error would make findings exit 1) —
  // the truth lives in the JSON. Accept 0 and 1 as "scan completed"; anything else is a
  // broken scanner/config → silence, not a block.
  if (r.code !== 0 && r.code !== 1) return null;
  const allowlist = readAllowlist(projectDir, ".vuln-allow");
  const findings = parseSemgrepJson(r.stdout).filter(
    (f) => !allowlist.some((re) => re.test(f.rule) || re.test(f.file)),
  );
  if (!findings.length) return null;
  return { reason: findingsToReason(findings, what, truncated) };
}

/** Staged files of a commit command: -a/-am → whole tracked delta, else the index. */
async function commitFiles(projectDir, rest, run) {
  const args = commitStagesAll(rest)
    ? ["diff", "HEAD", "--name-only", "--diff-filter=ACMR"]
    : ["diff", "--cached", "--name-only", "--diff-filter=ACMR"];
  const r = await run("git", args, { cwd: projectDir, timeout: 15000 });
  if (r.code !== 0) return [];
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Decide whether a shell command may run. Returns null (nothing to report) or
 * { reason }. Reacts to `git commit` only — the boundary where a vulnerability
 * becomes history.
 */
export async function checkGitCommit({ projectDir, command, run }) {
  if (readVulnMode(projectDir) === "off") return null; // `.vuln-guard = off` disables the hook entirely
  for (const { sub, rest } of gitCommands(command)) {
    if (sub !== "commit") continue;
    const files = await commitFiles(projectDir, rest, run);
    const result = await scanFiles({ projectDir, files, run, what: "the staged changes" });
    if (result) return result;
  }
  return null;
}

/** Scan one edited file (PostToolUse / tool_result, mode "always"). */
export async function scanSingleFile({ projectDir, filePath, run }) {
  let rel;
  try {
    rel = isAbsolute(filePath) ? relative(projectDir, filePath) : filePath;
  } catch {
    return null;
  }
  const relNorm = rel.replace(/\\/g, "/");
  if (!relNorm || relNorm.startsWith("..") || isAbsolute(relNorm)) return null;
  return scanFiles({ projectDir, files: [relNorm], run, what: `the edited file ${relNorm}` });
}
