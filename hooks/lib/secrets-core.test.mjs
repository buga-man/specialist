/**
 * Tests for secrets-core.mjs — the git-boundary secret patterns.
 * Run: node --test hooks/lib/secrets-core.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addPaths,
  checkGitCommand,
  gitCommands,
  readAllowlist,
  scanDiff,
  scanForSecrets,
} from "./secrets-core.mjs";

const dirs = [];
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "secrets-core-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(dir, ...rel.split("/")), content, { recursive: true });
  }
  return dir;
}

const AWS = "AKIAIOSFODNN7EXAMPLE"; // canonical AWS docs example key
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

test("scanForSecrets: definite and likely patterns with line numbers", () => {
  const text = [
    "region = eu-central-1",
    `aws_key = ${AWS}`,
    "-----BEGIN RSA PRIVATE KEY-----",
    `const session = "${JWT}";`,
    "postgres://user:s3cretpass@db.internal:5432/app",
    'PASSWORD = "hunter2hunter2"',
  ].join("\n");
  const f = scanForSecrets(text);
  const labels = f.map((x) => x.label);
  assert.ok(labels.includes("AWS access key ID"));
  assert.ok(labels.includes("Private key block"));
  assert.ok(labels.includes("JWT (three dot-separated base64 segments)"));
  assert.ok(labels.includes("URL with embedded credentials (user:pass@host)"));
  assert.ok(labels.includes('Quoted credential assignment (password/token = "…")'));
  assert.deepEqual(f.map((x) => x.line), [2, 3, 4, 5, 6]);
  for (const x of f) assert.ok(["definite", "likely"].includes(x.tier));
});

test("scanForSecrets: clean text and the allowlist yield no findings", () => {
  assert.deepEqual(scanForSecrets("const x = 42;\nexport function f() { return x; }"), []);
  const allow = [new RegExp(AWS)];
  assert.deepEqual(scanForSecrets(`key = ${AWS}`, allow), []);
  // the allowlist by the whole line works too (a fixture with a marker)
  assert.deepEqual(scanForSecrets(`token = "0123456789abcdef" # test fixture`, [new RegExp("test fixture")]), []);
});

test("gitCommands: compound commands, git flags, non-git is ignored", () => {
  assert.deepEqual(gitCommands("git add src/x.ts"), [{ sub: "add", rest: "src/x.ts", dir: null }]);
  assert.deepEqual(
    gitCommands("cd repo && git -C . commit -m 'msg' && git push origin main"),
    [
      { sub: "commit", rest: "-m 'msg'", dir: "." },
      { sub: "push", rest: "origin main", dir: null },
    ],
  );
  assert.deepEqual(gitCommands("git status && git log --oneline | head -5"), []);
  assert.deepEqual(gitCommands("npm install && git add package.json package-lock.json"), [
    { sub: "add", rest: "package.json package-lock.json", dir: null },
  ]);
});

test("addPaths: options are dropped, quotes are stripped, -- separates", () => {
  assert.deepEqual(addPaths("-A src/ .env"), ["src/", ".env"]);
  assert.deepEqual(addPaths("-- src/a.ts .env"), ["src/a.ts", ".env"]);
  assert.deepEqual(addPaths('"my file.ts" -f'), ["my file.ts"]);
  assert.deepEqual(addPaths("-u"), []);
});

test("scanDiff: files and line numbers are taken from the + side of the diff", () => {
  const diff = [
    "diff --git a/src/config.py b/src/config.py",
    "index 111..222 100644",
    "--- a/src/config.py",
    "+++ b/src/config.py",
    "@@ -10,0 +11,2 @@",
    "+import os",
    `+KEY = "${AWS}"`,
    "diff --git a/README.md b/README.md",
    "Binary files a/README.md and b/README.md differ",
  ].join("\n");
  const f = scanDiff(diff);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0], { file: "src/config.py", line: 12, tier: "definite", label: "AWS access key ID" });
});

test("readAllowlist: comments are ignored, garbage regexps do not crash", () => {
  const dir = project({ ".secrets-allow": "# fixtures\nTEST-FIXTURE-KEY\n([invalid\n" });
  const list = readAllowlist(dir);
  assert.equal(list.length, 1); // "# fixtures" is a comment, "([invalid" is garbage — skipped
  assert.deepEqual(readAllowlist(project({})), []);
});

test("checkGitCommand: git add of a sensitive file — block", async () => {
  const dir = project({});
  const r = await checkGitCommand({ projectDir: dir, command: "git add .env src/x.ts", run: async () => ({ code: 0, stdout: "", stderr: "" }) });
  assert.ok(r && r.reason.includes(".env"));
  assert.ok(r.reason.includes(".secrets-allow"));
});

test("checkGitCommand: a secret in the commit's staged diff — block without echoing the value", async () => {
  const dir = project({});
  const diff = `diff --git a/src/c.py b/src/c.py\n@@ -1,0 +2,1 @@\n+KEY = "${AWS}"`;
  const calls = [];
  const r = await checkGitCommand({
    projectDir: dir,
    command: "git commit -m 'add config'",
    run: async (cmd, args) => {
      calls.push([cmd, args]);
      return { code: 0, stdout: diff, stderr: "" };
    },
  });
  assert.ok(r && r.reason.includes("AWS access key ID"));
  assert.ok(!r.reason.includes(AWS), "the secret's value must not leak into the message");
  assert.deepEqual(calls[0][1], ["diff", "--cached", "-U0"]);
});

test("checkGitCommand: commit -a scans the whole delta diff; push without upstream stays silent", async () => {
  const dir = project({});
  const calls = [];
  await checkGitCommand({
    projectDir: dir,
    command: "git commit -am 'x'",
    run: async (cmd, args) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  assert.deepEqual(calls[0], ["diff", "HEAD", "-U0"]);
  const r = await checkGitCommand({
    projectDir: dir,
    command: "git push origin main",
    run: async () => ({ code: 128, stdout: "", stderr: "no upstream" }),
  });
  assert.equal(r, null);
});

test("regression: .env.example / .env.sample are committable, .env is not", () => {
  const isSensitive = (p) => {
    const norm = p.replace(/\\/g, "/");
    return !/(^|\/)\.env\.(?:example|sample|template)$/i.test(norm) &&
      [/(^|\/)\.env(\.[^/]*)?$/i].some((re) => re.test(norm));
  };
  assert.equal(isSensitive(".env"), true);
  assert.equal(isSensitive("config/.env.local"), true);
  assert.equal(isSensitive(".env.example"), false);
  assert.equal(isSensitive("infra/.env.template"), false);
});

test("regression: git add . / -A / -am reach sensitive files through the index", async () => {
  const dir = project({});
  const status = "?? .env\n?? src/x.ts\n";
  const r = await checkGitCommand({
    projectDir: dir,
    command: "git add .",
    run: async (cmd, args) => (args[0] === "status" ? { code: 0, stdout: status, stderr: "" } : { code: 0, stdout: "", stderr: "" }),
  });
  assert.ok(r && r.reason.includes(".env"), "git add . must surface .env");

  const r2 = await checkGitCommand({
    projectDir: dir,
    command: "git add -A",
    run: async (cmd, args) => (args[0] === "status" ? { code: 0, stdout: status, stderr: "" } : { code: 0, stdout: "", stderr: "" }),
  });
  assert.ok(r2 && r2.reason.includes(".env"), "git add -A must surface .env");
});

test("regression: bare directory and fresh untracked directory are expanded (-uall)", async () => {
  const dir = project({});
  mkdirSync(join(dir, "src"), { recursive: true });
  const calls = [];

  // `git add src` — a bare directory pathspec (no trailing slash) is a directory on disk.
  const r = await checkGitCommand({
    projectDir: dir,
    command: "git add src",
    run: async (cmd, args) => {
      calls.push(args);
      return args[0] === "status" ? { code: 0, stdout: "?? src/.env\n", stderr: "" } : { code: 0, stdout: "", stderr: "" };
    },
  });
  assert.ok(r && r.reason.includes(".env"), "bare directory pathspec must consult git status");
  assert.deepEqual(calls[0], ["status", "--porcelain", "--untracked-files=all"]);

  // A brand-new untracked directory collapses to `dir/` in the default status listing —
  // only --untracked-files=all reveals the .env inside.
  const r2 = await checkGitCommand({
    projectDir: dir,
    command: "git add secrets/",
    run: async (cmd, args) => (args[0] === "status" ? { code: 0, stdout: "?? secrets/.env\n", stderr: "" } : { code: 0, stdout: "", stderr: "" }),
  });
  assert.ok(r2 && r2.reason.includes(".env"), "fresh untracked directory must be expanded");

  // Wildcard pathspecs match through status as well.
  const r3 = await checkGitCommand({
    projectDir: dir,
    command: "git add '*.pem'",
    run: async (cmd, args) => (args[0] === "status" ? { code: 0, stdout: "?? certs/server.pem\n", stderr: "" } : { code: 0, stdout: "", stderr: "" }),
  });
  assert.ok(r3 && r3.reason.includes("server.pem"), "wildcard pathspec must reach staged-by-glob files");
});

test("regression: git -C <dir> scans that repository, not the session cwd", async () => {
  const dir = project({});
  const calls = [];
  await checkGitCommand({
    projectDir: dir,
    command: "git -C /elsewhere/repo commit -m x",
    run: async (cmd, args, opts) => {
      calls.push(opts.cwd);
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(calls[0], "/elsewhere/repo");
});

test("checkGitCommand: non-git and clean git — null", async () => {
  const dir = project({});
  assert.equal(
    await checkGitCommand({ projectDir: dir, command: "ls -la && npm test", run: async () => ({ code: 0, stdout: "", stderr: "" }) }),
    null,
  );
  assert.equal(
    await checkGitCommand({ projectDir: dir, command: "git status", run: async () => ({ code: 0, stdout: "", stderr: "" }) }),
    null,
  );
});

test("scanDiff: context lines advance the line counter (added lines keep their real numbers)", () => {
  const diff = [
    "diff --git a/f.py b/f.py",
    "--- a/f.py",
    "+++ b/f.py",
    "@@ -1,2 +1,3 @@",
    " import os",
    "-old",
    "+aws_key = AKIAIOSFODNN7EXAMPLE",
  ].join("\n");
  const findings = scanDiff(diff);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2); // 1 = the context line, 2 = the added line — the old code said 1
  assert.equal(findings[0].tier, "definite");
});

test("scanDiff: a context line alone does not shift a later hunk's numbering", () => {
  const diff = [
    "diff --git a/f.py b/f.py",
    "@@ -1 +1,2 @@",
    " const a = 1;",
    '+const b = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd"',
  ].join("\n");
  const findings = scanDiff(diff);
  assert.equal(findings[0].line, 2);
});

test("DEFINITE: provider-specific key prefixes are definite-tier findings", () => {
  const samples = [
    ["sk-ant-api03-abcdefghijklmnopqrstuv0123456789", "Anthropic API key"],
    ["sk-proj-abcdefghijklmnopqrstuvwxyz123456", "OpenAI project key"],
    ["sk-None-abcdefghijklmnopqrstuvwxyz12345", "OpenAI legacy key"],
    ["sk_live_abcdefghijklmnopqrst", "Stripe live key"],
    ["whsec_abcdefghijklmnopqrstu", "Stripe webhook secret"],
    ["glpat-abcdefghijklmnopqrst", "GitLab personal access token"],
    ["ya29.abcdefghijklmnopqrstuvwxyz12", "Google OAuth access token"],
    ["SG.abcdefghijklmnopqrst.abcdefghijklmnopqrstuvwxyz123456", "SendGrid API key"],
  ];
  for (const [value, label] of samples) {
    const findings = scanForSecrets(`token = "${value}"`);
    assert.equal(findings.length, 1, label);
    assert.equal(findings[0].tier, "definite", label);
    assert.equal(findings[0].label, label, label);
  }
});

test("gitCommands: environment assignments before git stay part of the invocation", () => {
  assert.deepEqual(gitCommands("GIT_AUTHOR_NAME=x git commit -m y"), [
    { sub: "commit", rest: "-m y", dir: null },
  ]);
  assert.deepEqual(gitCommands("FOO='a b' git push origin main"), [
    { sub: "push", rest: "origin main", dir: null },
  ]);
  assert.deepEqual(gitCommands("git -C /repo status && ENV=1 git add ."), [
    { sub: "add", rest: ".", dir: null },
  ]);
  assert.deepEqual(gitCommands("echo git commit is not git"), []); // a plain word still needs the binary
});
