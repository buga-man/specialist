# specialist hooks (Claude Code)

Hook logic lives in `lib/` and is shared with the pi extensions (`../extensions/`):
`spec-core.mjs` — the spec-discipline gate, `format-core.mjs` — formatting,
`lint-core.mjs` — linting, `secrets-core.mjs` — secrets at the git boundary,
`vuln-core.mjs` — the semgrep vulnerability scan, `plan-context-core.mjs` — plan-based
session orientation, `codestyle-core.mjs` — repository conventions freshness,
`skill-gate-core.mjs` — the process profile (fast lane), `git-watch-core.mjs` — parsing
tree-changing git operations and signaling about derived artifacts.
Registration — in `hooks.json` (event → matcher → command).

## spec-gate — enforces plan scope

`PreToolUse` on `Edit|Write|MultiEdit|NotebookEdit`. Blocks a code edit if it does not
fall within the files of **open** tasks of the active plan. The block returns an
explanation and ways forward to the agent — update the plan or discuss with the user.

**The plan contract** (`implementation-plan` requires the same and `spec-implementation`
follows it; keywords are recognized in both English and Russian):

- a plan = `docs/plans/*.md`; a task = a `### Task ...` section (or `###  ...`);
- a task is closed by an explicit `- Done: ...` line (also `- :` / `- :`)
  inside its section; `- [x] ...` checkboxes are step progress and **do not** close a task;
- edits are limited to the files from the `- Files:` line (or `- :`) — paths in
  backticks, on one line; globs are allowed (`src/**/*.css`). If the line exists but its
  paths cannot be parsed (no backticks), the gate **blocks** edits with an explanation
  instead of silently opening up; a task with no `- Files:` line at all imposes no
  restrictions:

  ```markdown
  ### Task 2: Add export endpoint
  - Files: `src/api/export.ts`, `src/api/export.test.ts`
  ```

**Always allowed**: `docs/**` (specs and plans) and any `*.md`. The `.spec-gate` mode
file is no exception: with a plan open, the agent cannot lift or weaken the gate without
a task in the plan; without a plan in `soft` mode the file is freely editable — the user
changes the mode; in `hard` mode it is blocked like any other code.

**Modes** — the `.spec-gate` file at the project root (committed with the repo):

| Value | Behavior |
|---|---|
| absent / `soft` | the hook is active only when a plan with open tasks exists |
| `hard` | blocks code edits even without a plan — until the pipeline produces one |
| `fast` | the file gate as in `soft`; plus the process profile — fast lane by default (see skill-gate) |
| `off` | the hook is off |

**Boundaries**: the hook does not look into edit contents (only the target file) and
does not parse `Bash` commands — edits through the shell cannot be intercepted by it;
semantic conformance to the spec is checked by `spec-review`. Plan parsing errors never
block work (fail-safe).

## format-guard — a formatter after an edit

`PostToolUse` on `Edit|Write|MultiEdit`. Runs the **project's** formatter for the
changed file and auto-fixes what it can:

- web files (ts/tsx/js/jsx/mjs/cjs/vue/svelte/css/scss/less/html/json/jsonc/yaml/yml)
  → `prettier` from the project's `node_modules` — only if prettier is declared in the
  project's package.json (a transitive copy is ignored); otherwise the hook is silent;
- `.py` → `ruff format` via `python`/`py` (no ruff — silent);
- unfixable errors (e.g. syntax) → exit 2 with the formatter's output — the agent
  fixes the file immediately.

## lint-guard — a linter after an edit

`PostToolUse` on `Edit|Write|MultiEdit`, format-guard's younger sibling: runs the
**project's** linter for the changed file with `--fix`, auto-fixes what it can, and
returns the unfixable violations to the agent to repair.

- web files (ts/tsx/js/jsx/mjs/cjs/vue/svelte) → `eslint` — only if eslint is declared
  in the project's package.json (a transitive copy is ignored); otherwise silent;
- `.py` → `ruff check --fix` (no ruff — silent);
- `.kt/.kts` → `ktlint --format` — only if ktlint is mentioned in the project's Gradle
  files and the binary is available; 1–3 s of JVM startup per edit is a deliberate
  cost, the support is opt-in;
- the exit-code map: 0 — clean, 1 — violations returned to the agent, anything else
  (a broken config, a missing interpreter) — silence: a broken linter never becomes a
  blocked edit.

## secrets-guard — secrets never reach git

`PreToolUse` on `Bash`. Fires only on `git add` / `git commit` / `git push` — the points
after which a leak becomes git history:

- `git add` of explicitly sensitive files (`.env`, `*.pem`/`*.key`, `id_rsa*`,
  `credentials*.json`, `.npmrc`, …) — blocked; `git add .`, `-A`, `-u`, or a directory —
  the files from `git status` are checked, so mass staging cannot sneak `.env` past the
  guard. The `.env.example` / `.env.sample` / `.env.template` templates are deliberately
  not considered sensitive — they are committable files without values;
- `git commit` — the staged diff is scanned against the patterns (for `-a`/`-am` — the
  whole delta diff);
- `git push` — the outgoing diff `@{upstream}..HEAD` is scanned (no upstream defined —
  silent).
- `git -C <directory> ...` — all checks run against that directory, not the session cwd.

Two pattern tiers: **definite** (AWS keys, private keys, GitHub/Google/Slack tokens)
and **likely** (JWT, `user:pass@host`, quoted credential assignments) — both block.
A finding never echoes the secret's value — only file:line and the type. A legitimate
fixture: a regex line in `.secrets-allow` at the project root (empty lines and `#`
comments are ignored, malformed regexes are skipped) plus a repeat of the command.
Non-git commands, git errors, and any internal errors — pass through (fail-safe).

## vuln-guard — semgrep at the commit boundary

The engine is semgrep; if it is not found on PATH (`semgrep`, `python -m semgrep`) the
hook is silent, zero overhead (semgrep is native on win/linux/mac, installed with
`pip install semgrep`).

- `PreToolUse` on `Bash`: `git commit` only — the staged files are scanned (for
  `-a`/`-am` — the whole delta diff, capped at 50 files); findings block the commit.
- `PostToolUse` on edits — optional: the `.vuln-guard` file at the project root —
  absent/garbage = commit only, `always` (synonym `edit`) = scan every edit too
  (2–5 s per edit), `off` = the hook does nothing, including the commit scan.
- Rules: the project's `semgrep.yml`/`.semgrep.yml` — the recommended path; without
  them, registry packs (`p/security-audit` plus language packs
  `p/python`/`p/typescript`/`p/javascript`/`p/kotlin` by extension) — best-effort.
  The first registry fetch needs network, after that semgrep's cache applies; a network
  failure — a silent skip.
- The finding signal is not the exit code (semgrep exits 0 even with findings) but the
  JSON result: exit codes 0 and 1 are parsed, anything else (a broken scanner/config) —
  silence, not a block.
- False positives: an inline `# nosemgrep: <rule-id>` next to the line, or a regex on
  the rule id/path in `.vuln-allow` at the project root (the `.secrets-allow` format).

## git-watch — git changed the tree under the agent

`PostToolUse` on `Bash` (Claude Code only). After a tree-changing git operation
(`commit`, `checkout`/`switch`, `merge`, `rebase`, `pull`, `reset`, `cherry-pick`,
`stash pop/apply`) the hook blindly reconciles derived artifacts with the disk — the
source of the change does not matter:

- the kb-index index has diverged from the disk → a "rebuild now" signal (a data
  derivative, no question asked — the Stop gate would not release the turn anyway);
- CODESTYLE.md is stale → an "ask the user" signal (the document is committed, the
  decision is substantive; updating — the codestyle skill's verify mode).

The signal is stderr, exit 2 — the agent sees it right after the operation. Git run in
the user's own terminal is invisible until the next SessionStart/Stop check (a
boundary). Without artifacts, on non-git commands, on errors — silence (fail-safe).

## plan-context — plan context at session start

`SessionStart` (startup|resume|clear). Prints a short orientation block — the active
plan with open tasks and their titles, the spec-gate mode, and the task-closure
contract; Claude Code adds the stdout to the session context, and a fresh session
starts "in the know" about the plan. Silent when there are no open tasks or the mode is
`off`. The pi counterpart is a single persistent message via `before_agent_start` (see
`../extensions/README.md`). With the `fast` profile it injects the profile block even
without an open plan (fast lane by default, stage skills — on an explicit request).
When `.spec-gate` is present (except `off`) it also adds an onboarding line about a
missing `CODESTYLE.md` / kb-index index: the opt-in marker is the `.spec-gate` file
itself — foreign repos without it are not touched.

## skill-gate — the process profile at skill invocation

`PreToolUse` on the `Skill` tool (Claude Code only). The profile is the same
`.spec-gate` file: a value of `fast` makes the fast lane the project default —
autonomous launch of stage skills (`brainstorm`, `system-thinking`, `decompositor`) is
blocked with an explanation of how to go through the fast lane and how to temporarily
switch the profile for an explicit user request. The skill name is normalized
(`/brainstorm`, `plugin:brainstorm` — the same thing). In the other modes the hook is
silent; pi has no skill-invocation interception — only the plan-context orientation
works there (soft control).

## codestyle-reminder — conventions must not go stale

`SessionStart` (startup|resume|clear), **never blocks**. If `CODESTYLE.md` sits at the
project root, the hook counts code commits from the `base` recorded in its frontmatter
and the days since `generated`; once the threshold is crossed (30 code commits or
30 days) a single reminder line is injected into the context, and the decision to
rebuild the document is the user's (staleness is a "maybe", not a proven error, so a
sanction would be disproportionate — unlike kb-gate, where a hash mismatch is a fact).

Freshness is repository state: derived from git (`git log base..HEAD`), no state file.
"Not markdown = code" is a deliberately crude heuristic: the cost of a false positive is
one line. The single freshness formula lives in `codestyle-core.mjs`; the CLI
`scripts/codestyle.mjs status` prints the same verdict as JSON — the verify mode of the
`codestyle` skill uses it too. Silent when: no document, broken frontmatter, git did not
answer (no repo, `base` unknown after a rebase), any error (fail-safe).

## Wiring

In Claude Code the plugin's hooks are registered automatically from `hooks.json`
(`${CLAUDE_PLUGIN_ROOT}` is substituted by the host). Manual check:

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"src/x.ts"},"cwd":"<project>"}' \
  | node "<path to the plugin>/hooks/lib/spec-gate.mjs"; echo "exit=$?"

# session orientation (the SessionStart equivalent, run manually):
echo '{"cwd":"<project>"}' | node "<path to the plugin>/hooks/lib/plan-context.mjs"

# conventions reminder (in a repo with CODESTYLE.md):
echo '{"cwd":"<project with CODESTYLE.md>"}' | node "<path to the plugin>/hooks/lib/codestyle-reminder.mjs"

# skill-gate: a stage skill under the fast profile → exit 2
echo '{"tool_name":"Skill","tool_input":{"skill":"brainstorm"},"cwd":"<project with .spec-gate = fast>"}' \
  | node "<path to the plugin>/hooks/lib/skill-gate.mjs"; echo "exit=$?"

# git-watch: a stale CODESTYLE.md after a git operation → exit 2 with a signal
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"<repo with a stale CODESTYLE.md>"}' \
  | node "<path to the plugin>/hooks/lib/git-watch.mjs"; echo "exit=$?"
```
