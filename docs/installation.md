# Installation and dependencies

This repository **is** the plugin: it lives in the git repository
`github.com/buga-man/specialist` and installs through the standard mechanisms of
**Claude Code**, **ZCode**, **pi agent**, **Codex CLI**, and **OpenCode**. Skills are
written once and work in every host
(the shared Agent Skills format); hooks and extensions are four wrappers of one logic —
Claude Code and ZCode (one protocol), Codex, OpenCode, pi ([more detail](hooks.md)).

## What is needed for full operation

### Required

| Component | Why | How to check |
|---|---|---|
| Access to github.com | installation via git (marketplace / `pi install` / clone) | `git ls-remote https://github.com/buga-man/specialist.git` |
| **Node.js ≥ 18** | every hook runs as `node <script>`; pi and OpenCode themselves run on Node | `node --version` |
| Claude Code, ZCode, pi agent, Codex CLI, or OpenCode | the host; the skills work in every one, hooks where the host has an interception point | — |

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
| `suite-gate` | `git` + the project's own test runner (the command from `.suite-gate`) | the project | silent — the gate is opt-in, without `.suite-gate` nothing runs |
| `edit-guard` | `prettier` + `eslint` — declared in the project's package.json; `ruff` — in the Python environment; `ktlint` — a binary on PATH + a mention in Gradle; semgrep — only for the opt-in edit scan (`.vuln-guard = always`) | the project | silent for files of that stack |

A note on prettier/eslint: a transitive copy in `node_modules` does not count — the tool
must be declared in the project's own `dependencies`/`devDependencies`. That way the hook
does not run someone else's formatter where the project did not choose it.

### Skill dependencies

| Skill | Needed | Comment |
|---|---|---|
| `tech-writer` (manual build) | Node + **Chrome or Edge** (headless PDF printing); for screenshots — the host's browser automation and a live dev stand | HTML is built without a browser; the browser is needed only for the PDF. Chrome/Edge is present on any Windows machine; on Linux/macOS it installs the standard way |
| `stand-acceptance` | the docker compose stand of the specific project; the host's browser automation for the UI checks | A team-and-project skill (a deliberate exception to portability) |
| the other 24 skills | only the agent itself and the repository | — |

## Installing into Claude Code

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist@specialist
```

After installation the following register automatically: 26 skills (autoloaded by
description; the pipeline's twenty plus `dispatch`, `scouts`, `retro`, and the three
`role-*` entry skills), the hooks from `hooks/hooks.json` (spec-gate, config-guard, skill-gate,
bash-policy, mutation-guard, secrets-guard, vuln-guard, suite-gate on PreToolUse;
git-watch, edit-guard on PostToolUse; plan-context, codestyle-reminder on
SessionStart; kb-gate on Stop).

Verification without pushing the marketplace — by a local path:

```
/plugin marketplace add <local path to the repository>
```

A quick manual check of a hook (it should print a message and `exit=2`):

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git add .env"},"cwd":"."}' \
  | node "<path to the plugin>/hooks/lib/secrets-guard.mjs"; echo "exit=$?"
```

## Installing into ZCode

ZCode speaks the Claude Code hook protocol, so the same adapters run there unchanged; the
ZCode manifest (`.zcode-plugin/plugin.json`) points it at `skills/` and
`hooks/hooks.json`. In the ZCode app:

1. **Plugin Marketplace → Add → Add Plugin Marketplace** — paste the path to this
   repository (the marketplace root — the directory holding `.claude-plugin/`).
2. **Personal → specialist → Install**.
3. The hooks register automatically; **Settings → Plugin Management** shows each hook and
   whether it is runnable. Plugin hooks run without a separate trust dialog.

Updating: the marketplace page's gear button → **Marketplace Sources** → refresh this
marketplace, then **Update** in the plugin details.

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

Updates: `pi update`. Pinning a version — by tag: `git:...specialist.git@v<release-tag>`.
After editing or adding extensions: `/reload` inside pi.

## Roles — analyst / developer / QA

The framework installs as one full plugin or as three skills-only role plugins
(`specialist-analyst`, `specialist-dev`, `specialist-qa`) — install one role and the
session carries only that role's skills (the role sets do not overlap; every role also
carries `dispatch`, the classifier/routing entry point, and its own `role-*` entry skill).
Role switching mid-session is governed by `dispatch`: only with the user's explicit
consent — switch here / a new session with the role / a role subagent / stay and record
the task for the other role.

- **Claude Code** — `/plugin install specialist-qa@specialist` (the same marketplace);
  **ZCode** — the marketplace page lists all four plugins. Switching roles day-to-day =
  enabling/disabling the installed plugins.
- **pi / skills-only** — `bash scripts/copy-skills.sh <target> --role qa` copies only
  that role's skills.
- `.spec-gate` can pin the session to one role (`role: qa`) — on Claude Code and ZCode
  the skill-gate then blocks out-of-role skills until the user consents to a switch.

Role plugins are skills-only: the guards (hooks) ship with the full `specialist` bundle —
do not install a role together with the bundle (the skill names collide). The `roles/`
trees are generated from `scripts/roles.mjs`; `node scripts/compliance.mjs --fix`
rebuilds them.

## Skills only, without installing the plugin

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist
bash scripts/copy-skills.sh claude   # → ~/.claude/skills
bash scripts/copy-skills.sh pi       # → ~/.pi/agent/skills
bash scripts/copy-skills.sh agents   # → ~/.agents/skills (cross-harness)
bash scripts/copy-skills.sh claude --role qa   # only the qa role's skills
```

Existing skills are not overwritten without confirmation. The target can be any directory:
`bash scripts/copy-skills.sh .claude/skills` (project-level skills). In this mode hooks and
extensions are **not installed** — skills only.

## Configuration files in the target project

The hooks read configuration from the root of the project where the work happens (not from
the plugin):

| File | Who reads it | Values | Default |
|---|---|---|---|
| `.spec-gate` | spec-gate, skill-gate | a single word — `soft` / `hard` / `fast` / `off`; or one directive per line: `mode:` (same values) and `role: analyst|dev|qa` (pins the session to one role — skill-gate blocks the other roles' skills until the user consents to a switch) | `soft`, no role (the gate is active only with an open plan) |
| `.vuln-guard` | vuln-guard | `commit` / `always` (a synonym of `edit`) / `off` | `commit` (a scan only on commit); `off` disables the hook entirely |
| `.suite-gate` | suite-gate | the first line is the test command (`npm test`, …); the rest are notes; `off` / empty — disabled | absent (the gate is opt-in: no file — nothing runs) |
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
- Fully: `/plugin uninstall specialist@specialist` (Claude Code; in ZCode —
  **Settings → Plugins** → uninstall), `pi remove specialist` (pi).
