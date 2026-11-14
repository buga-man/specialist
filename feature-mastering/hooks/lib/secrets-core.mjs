/**
 * secrets-core.mjs — shared logic for the secrets-guard hook.
 *
 * Keeps secrets out of git history by guarding the boundary where a leak becomes
 * permanent: `git add` of sensitive files, `git commit` (staged diff) and `git push`
 * (outgoing diff). Two finding tiers:
 *   - definite: high-certainty secret formats (AWS keys, private key blocks, cloud
 *     provider tokens) — always blocked;
 *   - likely: high-signal shapes that legitimate fixtures also produce (JWT, URLs with
 *     embedded credentials, quoted credential assignments) — blocked too, with an
 *     explicit escape hatch.
 *
 * The escape hatch is the `.secrets-allow` file in the project root: one regex per line
 * (empty lines and `#` comments ignored). A line of the diff (or an added file path)
 * matching any allowlist regex is skipped. Invalid regexes are skipped — fail-safe.
 *
 * Findings never echo the secret value itself: only file, line, and a pattern label.
 * `run()` is injected so both the Claude Code hook (child_process) and the pi extension
 * (pi.exec) share this logic. Any internal error must degrade to "allow" (fail-safe) —
 * that decision lives in the adapters; this core returns null on its own uncertainty.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** High-certainty secret formats. */
export const DEFINITE = [
  { label: "AWS access key ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Private key block", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----/ },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

/** High-signal shapes a legitimate fixture can also produce — blocked with the
 *  allowlist escape hatch called out in the reason. */
export const LIKELY = [
  { label: "JWT (three dot-separated base64 segments)", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
  { label: "URL with embedded credentials (user:pass@host)", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{6,}@/i },
  { label: 'Quoted credential assignment (password/token = "…")', re: /\b(?:passw(?:or)?d|passwd|pwd|secret|api_?key|token|auth)\b\s*[:=]\s*["'][^"']{8,}["']/i },
];

/** File names that should not enter git regardless of content. */
export const SENSITIVE_PATHS = [
  /(^|\/)\.env(\.[^/]*)?$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.[^/]*)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)credentials?[^/]*\.json$/i,
  /(^|\/)service-account[^/]*\.json$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
];

/** Committed by design — templates carry keys, never values. */
const NOT_SENSITIVE = /(^|\/)\.env\.(?:example|sample|template)$/i;

const isSensitivePath = (p) => {
  const norm = p.replace(/\\/g, "/");
  return !NOT_SENSITIVE.test(norm) && SENSITIVE_PATHS.some((re) => re.test(norm));
};

const MAX_FINDINGS = 20;

/** Parse an allowlist file (one regex per line, `#` comments and blanks ignored,
 *  invalid regexes skipped). Shared by secrets-guard (.secrets-allow) and
 *  vuln-guard (.vuln-allow). */
export function readAllowlist(projectDir, fileName = ".secrets-allow") {
  const out = [];
  try {
    const p = join(projectDir, fileName);
    if (!existsSync(p)) return out;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      try {
        out.push(new RegExp(line));
      } catch {
        /* invalid regex — skip, never block the workflow over the guard's own config */
      }
    }
  } catch {
    /* fall through with what we have */
  }
  return out;
}

/** True when a `git commit` command stages tracked changes itself (`-a` / `-am` / `--all`
 *  / any short-flag cluster containing "a"). Shared with vuln-guard. */
export function commitStagesAll(rest) {
  return /(^|\s)(-[A-Za-z]*a[A-Za-z]*|--all)(\s|$)/.test(String(rest));
}

const allowlisted = (text, allowlist) => allowlist.some((re) => re.test(text));

/** Scan text (line-oriented) for secret patterns. Returns findings with 1-based line numbers. */
export function scanForSecrets(text, allowlist = []) {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { label, re } of [...DEFINITE, ...LIKELY]) {
      const m = re.exec(line);
      if (!m) continue;
      if (allowlisted(line, allowlist) || allowlisted(m[0], allowlist)) continue;
      findings.push({ line: i + 1, tier: DEFINITE.some((d) => d.label === label) ? "definite" : "likely", label });
      break; // one finding per line — the most certain pattern wins by order
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}

/** Extract git invocations with the given subcommands (default: add|commit|push) from
 *  a (possibly compound) shell command. Shared with git-watch. */
export function gitCommands(command, ops = "add|commit|push") {
  const out = [];
  const re = new RegExp(`^\\s*git((?:\\s+(?:-[A-Za-z]\\s+\\S+|--\\S+(?:=\\S+)?))*)\\s+(${ops})\\b(.*)$`);
  for (const seg of String(command).split(/&&|\|\||;|\||\n/)) {
    const m = re.exec(seg);
    if (!m) continue;
    const dirMatch = /(?:^|\s)-C\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(m[1] || "");
    out.push({
      sub: m[2],
      rest: (m[3] || "").trim(),
      dir: dirMatch ? (dirMatch[1] ?? dirMatch[2] ?? dirMatch[3]) : null,
    });
  }
  return out;
}

/** Paths a `git add` command names explicitly (options dropped, quotes stripped). */
export function addPaths(rest) {
  const parts = String(rest).match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const paths = [];
  let options = true;
  for (const p of parts) {
    const unq = p.replace(/^["']|["']$/g, "");
    if (unq === "--") { options = false; continue; }
    if (options && unq.startsWith("-")) continue;
    paths.push(unq);
  }
  return paths.filter((p) => p && !p.startsWith("-"));
}

/** Parse a unified diff: findings map to the added lines ("+" side). */
export function scanDiff(diffText, allowlist = []) {
  const findings = [];
  let file = "";
  let ln = 0;
  for (const line of String(diffText).split(/\r?\n/)) {
    const fm = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
    if (fm) { file = fm[2]; ln = 0; continue; }
    if (file && line.startsWith("Binary files")) { file = ""; continue; }
    const hm = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hm) { ln = parseInt(hm[1], 10); continue; }
    if (!file || !ln) continue;
    if (line.startsWith("+")) {
      if (line.startsWith("+++")) continue;
      for (const { label, re } of [...DEFINITE, ...LIKELY]) {
        const m = re.exec(line.slice(1));
        if (!m) continue;
        if (allowlisted(line, allowlist) || allowlisted(m[0], allowlist)) continue;
        findings.push({ file, line: ln, tier: DEFINITE.some((d) => d.label === label) ? "definite" : "likely", label });
        break;
      }
      if (findings.length >= MAX_FINDINGS) break;
      ln++;
    }
  }
  return findings;
}

function findingsToReason(findings, kind) {
  const where = kind === "push" ? "the outgoing commits" : "the staged changes";
  const rows = findings
    .slice(0, MAX_FINDINGS)
    .map((f) => `  - ${f.file}:${f.line} — ${f.label}`)
    .join("\n");
  return (
    `secrets-guard: ${findings.length} likely secret(s) in ${where} — committing them puts them in git history, ` +
    `which is practically irreversible once pushed.\n${rows}\n` +
    "If a finding is a legitimate non-secret (test fixture, placeholder, docs example), add a matching regex line " +
    "to .secrets-allow in the project root and repeat the command. Otherwise remove the secret from the changes " +
    "and rotate it if it was ever committed before."
  );
}

function sensitiveToReason(paths) {
  return (
    `secrets-guard: \`git add\` targets sensitive file(s): ${paths.join(", ")} — they should not enter git history.\n` +
    "If the file is genuinely safe to commit (allowlisted fixture, docs example), add a matching regex line to " +
    ".secrets-allow in the project root and repeat the command; otherwise stage the files without it."
  );
}

/** Pathspec that covers more than one explicit file: `.`, a directory (with or
 *  without a trailing slash — decided on disk) or a wildcard. */
const isDirSpec = (dir, p) => {
  if (p === "." || p.endsWith("/") || /[*?]/.test(p)) return true;
  try {
    return statSync(join(dir, ...p.split("/"))).isDirectory();
  } catch {
    return false; // a path that does not exist (yet) reads as a single-file pathspec
  }
};

/** Wildcard pathspec → regexp (`*` crosses anything, `?` is one char). */
function globToRegExp(glob) {
  return new RegExp(
    "^" +
      String(glob)
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
  );
}

/** Does a status line fall under a directory/wildcard pathspec? */
function matchesPathspec(path, spec) {
  if (spec === ".") return true;
  if (/[*?]/.test(spec)) return globToRegExp(spec).test(path);
  const prefix = spec.replace(/^\.\//, "").replace(/\/+$/, "");
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * Decide whether a shell command may run. Returns null (nothing suspicious) or
 * { reason }. Purely async: git diffs are fetched through the injected run().
 */
export async function checkGitCommand({ projectDir, command, run }) {
  const allowlist = readAllowlist(projectDir);
  for (const { sub, rest, dir: cmdDir } of gitCommands(command)) {
    // `git -C <dir>` operates on <dir>, not on the session's cwd.
    const dir = cmdDir || projectDir;
    if (sub === "add") {
      // Explicit file paths are enough on their own. A directory (`.`, `src/`, bare
      // `src`), a wildcard (`*.pem`) or no path at all (`-A`) only reveals its contents
      // through the index — consult git status. `--untracked-files=all` is required: the
      // default listing collapses a fresh untracked directory to `dir/`, hiding a `.env`
      // inside it.
      const explicit = addPaths(rest);
      const dirSpecs = explicit.filter((p) => isDirSpec(dir, p));
      let candidates = explicit.filter((p) => !dirSpecs.includes(p));
      if (!explicit.length || dirSpecs.length) {
        const r = await run("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: dir, timeout: 15000 });
        if (r.code === 0 && r.stdout) {
          const fromIndex = r.stdout
            .split(/\r?\n/)
            .filter((l) => l.trim())
            .map((l) => l.slice(3).replace(/^.* -> /, "").trim());
          const underSpecs = (p) => !dirSpecs.length || dirSpecs.some((d) => matchesPathspec(p, d));
          candidates = candidates.concat(fromIndex.filter(underSpecs));
        }
      }
      const sensitive = candidates.filter((p) => !allowlisted(p, allowlist) && isSensitivePath(p));
      if (sensitive.length) return { reason: sensitiveToReason(sensitive) };
      continue;
    }
    const diffArgs =
      sub === "commit"
        ? commitStagesAll(rest)
          ? ["diff", "HEAD", "-U0"] // -a / -am stages tracked changes at commit time — scan the whole delta
          : ["diff", "--cached", "-U0"]
        : ["diff", "@{upstream}..HEAD", "-U0"]; // push: everything the push would publish
    const r = await run("git", diffArgs, { cwd: dir, timeout: 15000 });
    if (r.code !== 0 || !r.stdout) continue; // nothing staged / no upstream / git trouble — not our finding
    const findings = scanDiff(r.stdout, allowlist);
    if (findings.length) return { reason: findingsToReason(findings, sub) };
  }
  return null;
}
