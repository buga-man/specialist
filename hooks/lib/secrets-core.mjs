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
  { label: "Google OAuth access token", re: /\bya29\.[A-Za-z0-9_-]{20,}\b/ },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: "OpenAI project key", re: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { label: "OpenAI legacy key", re: /\bsk-None-[A-Za-z0-9_-]{20,}\b/ },
  { label: "Stripe live key", re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/ },
  { label: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { label: "GitLab personal access token", re: /\bglpat-[A-Za-z0-9_-]{16,}\b/ },
  { label: "SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
];

/** High-signal shapes a legitimate fixture can also produce — blocked with the
 *  allowlist escape hatch called out in the reason. */
export const LIKELY = [
  { label: "JWT (three dot-separated base64 segments)", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
  { label: "URL with embedded credentials (user:pass@host)", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{6,}@/i },
  { label: 'Quoted credential assignment (password/token = "…")', re: /\b(?:passw(?:or)?d|passwd|pwd|secret|api_?key|token|auth)\b\s*[:=]\s*["'][^"']{8,}["']/i },
];

/** The scan list with the tier precomputed — allocated once, not per diff line. */
const PATTERNS = [
  ...DEFINITE.map((p) => ({ ...p, tier: "definite" })),
  ...LIKELY.map((p) => ({ ...p, tier: "likely" })),
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

/** Unquotes a `git status --porcelain` path. With the default core.quotePath, paths
 *  holding non-ASCII or special characters are C-quoted ("a\tb.md" with a literal tab,
 *  "dönem.md"), and the quotes would let such a path dodge the sensitive-path patterns.
 *  Escapes handled: \" \\ \t \n \r and octal \\NNN — the octal bytes are git's UTF-8
 *  payload, so they are decoded as a byte sequence, not per character. A non-quoted
 *  value is returned as is. */
export function unquoteGitPath(path) {
  const s = String(path ?? "");
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') return s;
  const body = s.slice(1, -1);
  let out = "";
  let bytes = null; // octal runs collect here, then decode as UTF-8
  const flushBytes = () => {
    if (bytes) {
      out += Buffer.from(bytes).toString("utf8");
      bytes = null;
    }
  };
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "\\" || i + 1 >= body.length) {
      flushBytes();
      out += body[i];
      continue;
    }
    const c = body[++i];
    if (c === "n") {
      flushBytes();
      out += "\n";
    } else if (c === "t") {
      flushBytes();
      out += "\t";
    } else if (c === "r") {
      flushBytes();
      out += "\r";
    } else if (c >= "0" && c <= "7") {
      let octal = c;
      while (octal.length < 3 && i + 1 < body.length && body[i + 1] >= "0" && body[i + 1] <= "7") {
        octal += body[++i];
      }
      (bytes ??= []).push(parseInt(octal, 8));
    } else {
      flushBytes();
      out += c; // \" \\ and anything unexpected — the character itself
    }
  }
  flushBytes();
  return out;
}

/** The remote a `git push` names — its first non-flag argument; git's own default is
 *  "origin". A lone refspec ("git push HEAD:feat" names no remote) reads as the default
 *  too; a full push URL contains ":" and also falls back — a wrong remote just fails the
 *  fallback query, which is silence (fail-safe). */
function pushRemote(rest) {
  const first = addPaths(rest)[0];
  return first && !first.includes(":") && first !== "." ? first : "origin";
}

/** Scan text (line-oriented) for secret patterns. Returns findings with 1-based line numbers. */
export function scanForSecrets(text, allowlist = []) {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { label, re, tier } of PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      if (allowlisted(line, allowlist) || allowlisted(m[0], allowlist)) continue;
      findings.push({ line: i + 1, tier, label });
      break; // one finding per line — the most certain pattern wins by order
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}

/** Extract git invocations with the given subcommands (default: add|commit|push) from
 *  a (possibly compound) shell command. Shared with git-watch. Environment assignments
 *  before `git` (`GIT_AUTHOR_NAME=x git commit …`) are part of the invocation. */
export function gitCommands(command, ops = "add|commit|push") {
  const out = [];
  const envPrefix = `(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\\S+)\\s+)*`;
  const re = new RegExp(`^\\s*${envPrefix}git((?:\\s+(?:-[A-Za-z]\\s+\\S+|--\\S+(?:=\\S+)?))*)\\s+(${ops})\\b(.*)$`);
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
      for (const { label, re, tier } of PATTERNS) {
        const m = re.exec(line.slice(1));
        if (!m) continue;
        if (allowlisted(line, allowlist) || allowlisted(m[0], allowlist)) continue;
        findings.push({ file, line: ln, tier, label });
        break;
      }
      if (findings.length >= MAX_FINDINGS) break;
      ln++;
      continue;
    }
    if (line.startsWith(" ")) ln++; // a context line also occupies a line on the "+" side
    // "-", "\", and the header lines advance nothing.
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
    if (sub === "commit") {
      const diffArgs = commitStagesAll(rest)
        ? ["diff", "HEAD", "-U0"] // -a / -am stages tracked changes at commit time — scan the whole delta
        : ["diff", "--cached", "-U0"];
      const r = await run("git", diffArgs, { cwd: dir, timeout: 15000 });
      if (r.code !== 0 || !r.stdout) continue; // nothing staged / git trouble — not our finding
      const findings = scanDiff(r.stdout, allowlist);
      if (findings.length) return { reason: findingsToReason(findings, "commit") };
      continue;
    }
    // push: everything the push would publish. A dry run publishes nothing — a rehearsal
    // must not be blocked for the secrets it would have leaked.
    if (/(^|\s)(-[A-Za-z]*n[A-Za-z]*|--dry-run)(\s|$)/.test(rest)) continue;
    const upstream = await run("git", ["diff", "@{upstream}..HEAD", "-U0"], { cwd: dir, timeout: 15000 });
    let diff = upstream.code === 0 ? upstream.stdout : "";
    if (upstream.code !== 0) {
      // No upstream — the first push of a branch, the dominant feature-flow shape. The
      // commits the push would send are the ones on HEAD that no remote-tracking ref of
      // the pushed remote holds; `git log -p` over exactly those yields the unified diffs
      // scanDiff parses. A repository with no remote refs at all (a first push) scans the
      // whole history — correct: that push publishes all of it. `git push --all` covers
      // only the current branch here — a documented residual.
      const unpushed = await run(
        "git",
        ["log", "--format=", "-p", "-U0", "HEAD", "--not", `--remotes=${pushRemote(rest)}`],
        { cwd: dir, timeout: 15000 },
      );
      if (unpushed.code === 0 && unpushed.stdout) diff = unpushed.stdout;
    }
    if (!diff) continue; // nothing outgoing / git trouble — not our finding
    const findings = scanDiff(diff, allowlist);
    if (findings.length) return { reason: findingsToReason(findings, "push") };
  }
  return null;
}
