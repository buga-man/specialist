# Hooks: mechanical discipline

The pipeline's rules live in skills, but a skill is a request to the model. A hook is a
barrier at the tool level: an edit outside the plan does not go through, a secret never
reaches git, a broken formatter is fixed on the spot. One logic, four wrappers: the shared
core in `hooks/lib/*.mjs`, plus one adapter per host — the Claude Code hook (stdin JSON,
exit 2 = block), the Codex hook (the same stdin; JSON output where Codex differs —
`apply_patch` edits, `additionalContext` on PostToolUse/SessionStart, `{"decision":
"block"}` on Stop; registered by `hooks/hooks-codex.json`), the pi extension
(`pi.on(...)`, TypeScript in `extensions/`), and the OpenCode plugin
(`plugins/opencode/`, blocking by throwing from `execute.before`).

## Host support

| Hook | Claude Code | Codex | pi | OpenCode |
|---|---|---|---|---|
| `spec-gate` | ✅ block | ✅ block (`apply_patch` payloads are checked file by file) | ✅ block | ✅ block |
| `secrets-guard` | ✅ block | ✅ block | ✅ block | ✅ block |
| `vuln-guard` | ✅ commit blocks; edit scan opt-in | ✅ commit blocks; edit scan via `additionalContext` | ✅ commit blocks; edit scan opt-in | ✅ commit blocks; edit scan throws |
| `format-guard` / `lint-guard` | ✅ failures return to the agent | ✅ findings via `additionalContext` | ✅ failures flag the result | ✅ failures throw |
| `git-watch` | ✅ signal (exit 2) | ✅ signal (`additionalContext`) | ✅ signal appended to the tool result | ✅ signal appended to the output |
| `plan-context` | ✅ session start | ✅ session start | ✅ first prompt | ✅ once per session |
| `codestyle-reminder` | ✅ session start | ✅ session start | ✅ session start (persistent message) | ✅ with the session orientation |
| `kb-gate` | ✅ Stop blocks (exit 2) | ✅ Stop blocks (`{"decision": "block"}`) | ✅ settle-time follow-up (`agent_settled` → a continuation turn) | — (no turn-end interception point) |
| `skill-gate` | ✅ Skill tool | — (no Skill tool) | — (no interception point) | — (no interception point) |

Codex runs untrusted hooks only after explicit trust (`/hooks`), and its PostToolUse is
record-only — report-only hooks there deliver findings as `additionalContext` instead of
blocking. Where a host has no interception point — `skill-gate` outside Claude Code,
`kb-gate` on OpenCode — the discipline degrades to what the skills request; that is a
documented boundary, not a silent gap.

## Overview

The overview maps the Claude Code and pi wiring; the Host support table above covers all
four hosts.

| Hook | Claude Code | pi | What it does | Dependency | Project config |
|---|---|---|---|---|---|
| `spec-gate` | PreToolUse: Edit/Write/MultiEdit/NotebookEdit | `tool_call` edit/write | edit outside the plan — blocked | Node | `.spec-gate` |
| `skill-gate` | PreToolUse: Skill | — | in the `fast` profile, blocks autonomous runs of the pipeline's stage skills | Node | `.spec-gate` |
| `secrets-guard` | PreToolUse: Bash | `tool_call` bash | secrets never reach git | Node, git | `.secrets-allow` |
| `vuln-guard` | PreToolUse: Bash (commit) + PostToolUse (opt-in) | `tool_call` bash + `tool_result` edit/write | semgrep at the commit boundary | Node, git, **semgrep** | `.vuln-guard`, `.vuln-allow`, `semgrep.yml` |
| `git-watch` | PostToolUse: Bash | `tool_result` bash | after tree-changing git operations, a signal about stale derived artifacts | Node, git | — |
| `format-guard` | PostToolUse: Edit/Write/MultiEdit | `tool_result` edit/write | formatter after an edit | Node + the project's prettier/ruff | — |
| `lint-guard` | PostToolUse: Edit/Write/MultiEdit | `tool_result` edit/write | linter after an edit | Node + the project's eslint/ruff/ktlint | — |
| `plan-context` | SessionStart (startup/resume/clear/compact) | `before_agent_start` | orients a fresh session to the plan | Node | — |
| `codestyle-reminder` | SessionStart (startup/resume/clear/compact) | `session_start` | reminds about a stale CODESTYLE.md | Node, git | — |
| `kb-gate` | Stop | `agent_settled` | the documentation index diverged from disk — blocked until rebuilt | Node | — |

All hooks are **fail-safe**: a hook failure, garbage in the config, a missing dependency →
the work is skipped, not blocked. Messages are in English (the model's language); plan and
spec content is in the team's working language.

---

## spec-gate — enforces plan scope

Blocks a code edit if the file is not in the file lists of **unclosed** tasks of the active
plan. The block returns an explanation and ways forward to the agent (update the plan or
discuss with the user).

**The plan contract** (`docs/plans/*.md`, markers are English-only):

- a task = a `### Task ...` section;
- task files = paths in backticks on the `- Files:` line (globs are supported:
  `src/**/*.css`); if the line is present but no paths could be parsed from it, the gate
  blocks with an explanation of the format instead of opening silently;
- closure = an explicit `- Done: ...` line; `- [x]` checkboxes
  are step progress and do **not** close a task. That is why the plan template contains no
  `- Done:` line — the executor adds it when closing a task.
- every other line is ignored by the gate (`- Verify:`, `- Verify (red):`, `- Risk:`,
  `- Revert:`, `- Criteria:`), and `## ...` headers end a task — plan-level sections
  (`## Revert`, `## Decision log`) belong after the last task.

**Modes** (the `.spec-gate` file at the project root):

| Value | Behavior |
|---|---|
| missing / `soft` | the gate is active only when a plan with unclosed tasks exists |
| `hard` | blocks code edits even without a plan — the pipeline produces a plan first |
| `fast` | the file gate as in `soft`, plus a process profile: fast lane is the default (see `skill-gate`) |
| `off` | the hook is disabled |

**Always allowed**: `docs/**` and any `*.md`. The `.spec-gate` file is not an exception:
with an open plan, the agent cannot lift or weaken the gate itself — the mode is changed by
the user. In `hard` without a plan it is blocked too (the pipeline's first step creates the
plan); the user edits it.

**Boundaries:** does not read the contents of edits (only the target file); does not
intercept edits via Bash; semantic fit to the spec is checked by `spec-review`.

## skill-gate — the process profile at skill invocation

`PreToolUse` on the `Skill` tool (Claude Code only; pi has no interception point for skill
invocations — there the profile arrives only through plan-context's orientation). The same
`.spec-gate` file sets the profile: the value `fast` makes fast lane the project default —
autonomous runs of the pipeline's stage skills (`brainstorm`, `system-thinking`,
`decompositor`) are blocked with an explanation: a small task goes through fast lane (a
mini-spec in the header of a one-task plan), while an explicit user request is served by
temporarily switching the profile to `soft`.

The skill name is normalized (`/brainstorm` and `plugin:brainstorm` are the same thing).
The profile changes the default rather than forbidding forever: without an open plan,
`.spec-gate` is edited freely (the file gate allows it); with an open plan, only the user
changes the mode. In `soft`/`hard`/`off` the hook is silent.

## secrets-guard — secrets never reach git

Triggers only on `git add` / `git commit` / `git push` — the points after which a leak
becomes git history:

- `git add` of sensitive files by name: `.env`, `*.pem`/`*.key`, `id_rsa*`,
  `credentials*.json`, `service-account*.json`, `.npmrc`, `.netrc` and similar — blocked;
  bulk staging (`git add .`, `-A`, `-u`, a directory — with or without a trailing slash —
  and a wildcard path) is checked via `git status --untracked-files=all`, so `.env` does
  not slip past the guard — including inside a fresh untracked directory that the default
  listing collapses into one line. `.env.example` / `.env.sample` / `.env.template` are
  committable templates without values; they are not blocked;
- `git commit` — a scan of the staged diff (for `-a`/`-am` — the whole delta diff);
- `git push` — a scan of the outgoing diff `@{upstream}..HEAD` (upstream undefined — silent);
- `git -C <directory>` — the specified directory is checked, not the session's cwd.

**Two tiers of patterns**, both blocking: *definite* (AWS keys, private keys,
GitHub/Google/Slack tokens — almost no false positives) and *likely* (JWT,
`user:pass@host`, quoted credential assignments — can hit a legitimate fixture).

A finding **never echoes the secret's value** — only file:line and the type. Legitimate
fixture: a regexp line in `.secrets-allow` at the project root and repeating the command.
Non-git commands and git errors — pass through.

## vuln-guard — semgrep at the commit boundary

By default — `git commit` only: a scan of the staged files (for `-a`/`-am` — the delta,
capped at 50 files) by the semgrep engine; findings block the commit with a report
"rule — file:line — message". Scanning every edit is opt-in: `.vuln-guard` = `always`
(a synonym of `edit`); `off` — the hook is disabled entirely, the commit scan too.

- **Rules:** the project's `semgrep.yml`/`.semgrep.yml` is the recommended path (picked up
  automatically); without them — `p/security-audit` plus the registry's language packs
  (`p/python`, `p/typescript`, `p/javascript`, `p/kotlin` by extension). The first registry
  fetch needs the network; after that semgrep caches; a network failure — a silent skip.
  To be honest: registry packs are best-effort; for serious coverage, maintain your own
  `semgrep.yml`.
- **A finding is signaled by JSON, not the exit code** (semgrep exits 0 even with
  findings): exit codes 0 and 1 are parsed; anything else = a broken scanner → silence,
  not a block.
- **False positives:** an inline `# nosemgrep: <rule-id>` on the line, or a regexp on the
  rule-id/path in `.vuln-allow` at the root.
- semgrep not installed (`semgrep` / `python -m semgrep`) — a no-op (the overhead is a few
  quick probes of the binary per check);
  native on Windows/Linux/macOS, installed with `pip install semgrep`.

## git-watch — git changed the tree under the agent

`PostToolUse` on `Bash` (Claude Code only). After a tree-changing git operation
(`commit`, `checkout`/`switch`, `merge`, `rebase`, `pull`, `reset`, `cherry-pick`,
`stash pop/apply`), the hook dumbly cross-checks the derived artifacts against disk — the
source of the change (a branch, a rebase, a pull) does not matter:

- **the kb-index index diverged from disk** → signal: rebuild it now — it is a pure
  derivative of the data, no permission needed (the Stop gate will not release the turn
  with a stale index anyway);
- **CODESTYLE.md is stale** (the same thresholds as codestyle-reminder) → signal: the agent
  must **ask the user** whether to update the document (the verify mode of the codestyle
  skill) — the document is committed, this is a substantive decision.

The signal is stderr with exit 2; the agent sees it right after the operation. Neither
artifact is updated silently. Git executed by the user in their own terminal, bypassing
the agent, is invisible until the next SessionStart/Stop check — a documented boundary,
like spec-gate's Bash boundary. With neither artifact present, on non-git commands, and on
any error — silence (fail-safe).

## format-guard — formatter after an edit

`PostToolUse`: runs the **project's** formatter on the changed file, auto-fixing what it
can; unfixable errors (for example, syntax) → exit 2 with the output — the agent fixes the
file on the spot, not on CI.

- web files (ts/tsx/js/jsx/mjs/cjs/vue/svelte/css/scss/less/html/json/jsonc/yaml/yml)
  → `prettier` from the project's node_modules — only if prettier is declared in its
  package.json (a transitive copy is ignored); if not — silent;
- `.py` → `ruff format` (no ruff — silent).

## lint-guard — linter after an edit

The younger sibling of format-guard: `--fix` auto-fixes, and the remaining violations are
handed to the agent.

- eslint — web files, when declared in the project's package.json + the binary in
  node_modules;
- `ruff check --fix` — `.py`;
- `ktlint --format` — `.kt/.kts`, only if ktlint is mentioned in the project's Gradle files
  and the binary is available; a 1–3 s JVM startup per edit is a deliberate cost, opted in
  by the mere fact of declaring it.
- **Exit-code map:** 0 — clean; 1 — violations handed to the agent; anything else (a broken
  config, no interpreter) — silence: a broken linter never blocks an edit.

## plan-context — a fresh session starts in the know

At session start (Claude Code `SessionStart`; pi — one persistent message via
`before_agent_start`), it injects a short block: how many tasks are open in `docs/plans/`,
their titles, the spec-gate mode, and the closure contract (`- Done:` closes a task,
checkboxes are progress). The goal — the agent never edits against a plan it does not know
about.

With the `fast` profile (`.spec-gate`), it also injects the profile block — **even without
an open plan**: fast lane is the default for small tasks; stage skills only on the user's
explicit request.

Onboarding: if the project has a `.spec-gate` (any mode except `off`) but `CODESTYLE.md`
or `.kbindex/index.json` is missing — a reminder line is added naming the skill that closes
the gap. The opt-in marker is the mere presence of `.spec-gate`: without it, other
repositories are left untouched. A missing artifact is incomplete onboarding, not an error,
so the hook does not block.

Silent when `off` or when there is nothing to report; with no open tasks it injects only
the `fast` profile and onboarding. Never repeats twice within a session.

## codestyle-reminder — conventions must not go stale

`SessionStart`, **never blocks**. If `CODESTYLE.md` sits at the project root, the hook
counts code commits since the `base` recorded in its frontmatter and the days since
`generated`; once the threshold is crossed (30 code commits or 30 days), a single reminder
line is injected into the context. The decision to rebuild the document belongs to the
user: staleness is *possible* outdatedness, not a proven error, so the hook does not block
(kb-gate blocks because a hash mismatch is a fact, fixable with one command).

Freshness is a property of the repository, derived entirely from git; there is no state
file. "Not markdown = code" is a deliberately crude heuristic: the price of a false
positive is one line. The single formula lives in `codestyle-core.mjs`;
`skills/codestyle/scripts/codestyle.mjs status` prints the same verdict as JSON — the
verify mode of the `codestyle` skill uses the same verdict.

Silent when: no document, broken frontmatter, git did not answer (no repo, `base` unknown
after a history rewrite), any error — fail-safe.

## kb-gate — the index must not diverge from disk

The `Stop` hook cross-checks the documentation index (`.kbindex/index.json`) against disk:
a document changed, appeared, or disappeared — the index is stale. The hook blocks the end
of the turn and says what to rebuild.

**When it fires:** after the agent has finished its work and the index does not match disk.
The check is by `sha1` of contents: reading and hashing 1800 documents takes about 0.12 s,
the whole hook about 0.3 s.

**The message (stderr, exit 2):**

```
kb-index: documentation index is stale (2 changed, 1 added, 0 removed). Rebuild it: node "<plugin>/skills/kb-index/scripts/kb.mjs" build --project "<project root>"
```

The project directory is given explicitly: a rebuild from a subdirectory would create the
index somewhere other than where the hook looks for it, and the block would repeat until
`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` fires.

**What does not block:**

- no `.kbindex/index.json` — nothing is created in someone else's project;
- `stop_hook_active` — the agent is already continuing because of a previous block (the
  second safety fuse — `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`, 8 by default); the hook writes
  that to stderr and lets the turn go;
- any error inside the hook — fail-safe, as with every hook of the plugin.

## How to check a hook by hand

```bash
# spec-gate: an edit outside the plan → exit 2
echo '{"tool_name":"Edit","tool_input":{"file_path":"src/x.ts"},"cwd":"<project with a plan>"}' \
  | node "<plugin>/hooks/lib/spec-gate.mjs"; echo "exit=$?"

# skill-gate: a stage skill in the fast profile → exit 2
echo '{"tool_name":"Skill","tool_input":{"skill":"brainstorm"},"cwd":"<project with .spec-gate = fast>"}' \
  | node "<plugin>/hooks/lib/skill-gate.mjs"; echo "exit=$?"

# git-watch: a stale CODESTYLE.md after a git operation → exit 2 with a signal
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"<repo with a stale CODESTYLE.md>"}' \
  | node "<plugin>/hooks/lib/git-watch.mjs"; echo "exit=$?"

# secrets-guard: .env on commit → exit 2
echo '{"tool_name":"Bash","tool_input":{"command":"git add .env"},"cwd":"."}' \
  | node "<plugin>/hooks/lib/secrets-guard.mjs"; echo "exit=$?"

# plan-context: the orientation block on stdout
echo '{"cwd":"<project with an open plan>"}' | node "<plugin>/hooks/lib/plan-context.mjs"

# codestyle-reminder: a reminder on stdout (in a repo with a stale CODESTYLE.md)
echo '{"cwd":"<project with CODESTYLE.md>"}' | node "<plugin>/hooks/lib/codestyle-reminder.mjs"
```

Tests of all cores: `npm test` at the repository root.

## Deliberate boundaries of the hook system as a whole

- **No hook checks semantics against the spec** — that is `spec-review`'s job. Hooks catch
  mechanics (plan boundaries, secrets, lint, format), not meaning.
- **spec-gate does not intercept Bash** — an agent editing code through `sed -i` bypasses
  the gate; this is a documented limitation, not a hole: the discipline in the executor's
  reports and spec-review surfaces such bypasses anyway.
- **secrets/vuln-guard scan only the git boundary** — a file written into the repo and
  committed by someone else's tool, bypassing the agent, is not seen by the hooks (an
  ordinary pre-commit framework will cover the residual risk).
- **Security scanning of code semantics** — vuln-guard on top of semgrep; heavier SAST/SCA
  (dependencies, container images) is CI's territory, not hooks'.
