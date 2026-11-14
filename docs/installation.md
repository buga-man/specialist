# Installation and dependencies

This repository **is** the plugin: it lives in the git repository
`github.com/buga-man/specialist` and installs through the standard mechanisms of
**Claude Code**, **pi agent**, **Codex CLI**, and **OpenCode**. Skills are written once
and work in every host
(the shared Agent Skills format); hooks (Claude Code) and extensions (pi) are a dual
implementation of one logic ([more detail](hooks.md)).

## What is needed for full operation

### Required

| Component | Why | How to check |
|---|---|---|
| Access to github.com | installation via git (marketplace / `pi install` / clone) | `git ls-remote https://github.com/buga-man/specialist.git` |
| **Node.js ≥ 18** | every hook runs as `node <script>`; pi and OpenCode themselves run on Node | `node --version` |
| Claude Code, pi agent, Codex CLI, or OpenCode | the host; the skills work in every one, hooks where the host has an interception point | — |

Important: **the plugin itself carries no npm dependencies** — the hooks use only the
Node standard library. Everything below is a dependency of *your projects*, not of the
plugin.

### Hook dependencies — optional

A hook whose dependency is not found **silently skips its work** (fail-safe): a missing
tool never breaks a session, but it also provides no protection. For "full operation",
install:

| Hook | Dependency | Source | Without it |
|---|---|---|---|
| `spec-gate` | — (Node only) | — | always works |
| `plan-context` | — (Node only) | — | always works |
| `secrets-guard` | `git` | a system package | reacts only to git commands, which do not exist without git |
| `vuln-guard` | **semgrep** | `pip install semgrep` (native on Windows/Linux/macOS) | no-op (the overhead is a few quick probes of the binary per check) |
| `format-guard` | `prettier` — declared in the project's package.json; `ruff` — in the Python environment | the project | silent for files of that stack |
| `lint-guard` | `eslint` — declared in package.json; `ruff`; `ktlint` — a binary on PATH + a mention in Gradle | the project | silent for files of that stack |

A note on prettier/eslint: a transitive copy in `node_modules` does not count — the tool
must be declared in the project's own `dependencies`/`devDependencies`. That way the hook
does not run someone else's formatter where the project did not choose it.

### Skill dependencies

| Skill | Needed | Comment |
|---|---|---|
| `tech-writer` (manual build) | Node + **Chrome or Edge** (headless PDF printing); for screenshots — the host's browser automation and a live dev stand | HTML is built without a browser; the browser is needed only for the PDF. Chrome/Edge is present on any Windows machine; on Linux/macOS it installs the standard way |
| `stand-acceptance` | the docker compose stand of the specific project, chrome-devtools MCP | A team-and-project skill (a deliberate exception to portability) |
| the other 10 skills | only the agent itself and the repository | — |

## Installing into Claude Code

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist@specialist
```

After installation the following register automatically: 12 skills (autoloaded by
description), the hooks from `hooks/hooks.json` (spec-gate, skill-gate, secrets-guard,
vuln-guard on PreToolUse; git-watch, format-guard, lint-guard, vuln-guard on PostToolUse;
plan-context, codestyle-reminder on SessionStart; kb-gate on Stop).

Verification without pushing the marketplace — by a local path:

```
/plugin marketplace add <local path to the repository>
```

A quick manual check of a hook (it should print a message and `exit=2`):

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git add .env"},"cwd":"."}' \
  | node "<path to the plugin>/hooks/lib/secrets-guard.mjs"; echo "exit=$?"
```

## Installing into pi agent

```bash
pi install git:github.com/buga-man/specialist.git
```

The git source makes pi install the repository **whole** — the repository root is the
plugin itself (the pi manifest is the root `package.json`). From a clone, by a local path:

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist
pi install .
```

Updates: `pi update`. Pinning a version — by tag: `git:...skills.git@v<release-tag>`.
After editing or adding extensions: `/reload` inside pi.

## Skills only, without installing the plugin

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist
bash scripts/copy-skills.sh claude   # → ~/.claude/skills
bash scripts/copy-skills.sh pi       # → ~/.pi/agent/skills
bash scripts/copy-skills.sh agents   # → ~/.agents/skills (cross-harness)
```

Existing skills are not overwritten without confirmation. The target can be any directory:
`bash scripts/copy-skills.sh .claude/skills` (project-level skills). In this mode hooks and
extensions are **not installed** — skills only.

## Configuration files in the target project

The hooks read configuration from the root of the project where the work happens (not from
the plugin):

| File | Who reads it | Values | Default |
|---|---|---|---|
| `.spec-gate` | spec-gate | `soft` / `hard` / `off` | `soft` (the gate is active only with an open plan) |
| `.vuln-guard` | vuln-guard | `commit` / `always` (a synonym of `edit`) / `off` | `commit` (a scan only on commit); `off` disables the hook entirely |
| `.secrets-allow` | secrets-guard | one regexp per line; `#` — a comment | absent |
| `.vuln-allow` | vuln-guard | a regexp on the rule-id or path; `#` — a comment | absent |
| `semgrep.yml` / `.semgrep.yml` | vuln-guard | the project's semgrep rules | registry packs (best-effort) |

Garbage in a config file → the default value; a failure of any hook → the work is skipped,
not blocked. Discipline: the agent cannot lift the gate itself (`.spec-gate` is protected
while a plan is open) — the modes are changed by a human.

## Verification after installation

1. Skills: ask the agent to "gather requirements" — `brainstorm` should pick it up.
2. Hooks: the `git add .env` command from the example above → a block with an explanation.
3. plan-context: create a plan `docs/plans/test.md` with a task (`### Task 1`, `- Files:`),
   start a new session — a `plan-context: 1 open task(s)...` block appears in the context.
4. The plugin's full test suite: `npm test` at the repository root (tests of all hook cores
   and the manual builder; no external dependencies).

## Disabling and removal

- Pointwise: `.spec-gate` = `off`, `.vuln-guard` = `off` in a specific project.
- Fully: `/plugin uninstall specialist@specialist` (Claude Code),
  `pi remove specialist` (pi).
