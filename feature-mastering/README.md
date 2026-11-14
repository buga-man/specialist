# feature-mastering

A full-cycle feature development plugin for **Claude Code** and **pi agent**: from a raw
task to spec-driven code. Skills are written once and work in both programs (the shared
Agent Skills format); installation uses each program's native mechanisms, and the skills
can be used without installing the plugin.

## Pipeline

```
task → brainstorm → business spec
      business spec → system-thinking → system spec (repositories, contracts, rollout)
            system spec → decompositor → repo spec (files, patterns, tests, repo docs)
                  repo spec → implementation-plan → task plan (tasks for the agent)
                        task plan → spec-implementation → code (tests first, the spec as the oracle)
                              code → spec-review → acceptance (criterion by criterion, verdicts with evidence)
                                    unverifiable → stand-acceptance (live acceptance on the stand)

after merge / before release → tech-writer → docs audit (code ↔ specs, amendments via Amendments)
                                            + user manual (md → html + pdf, screenshots from the stand)

bugs → root-cause → reproduction → root cause → red test → minimal fix
      (risky fix → spec-review in a fresh session)

small tasks → fast lane → mini-spec + one-task plan (one artifact) → code → batch spec-review
      (profile `fast` in .spec-gate: stage skills — only on an explicit user request)
```

| Skill | Input → Output |
|---|---|
| `brainstorm` | raw task → business spec (no code; ≤10 questions, acceptance criteria, business cases) |
| `system-thinking` | business spec → system spec (which repositories change, contracts, blast radius; architecture changes are always explicit) |
| `decompositor` | system spec → repo spec (change sites, repo patterns, anchor snippets) |
| `implementation-plan` | repo spec → task plan for the agent (vertical slices, Verify "command → expected result", one task = one commit) |
| `spec-implementation` | plan → code (tests first, the spec as the oracle: spec > test > code; three-tier deviations; report: decisions, rulings, spec amendments) |
| `spec-review` | code → acceptance against the specs (criterion by criterion: passed/failed/unverifiable with evidence; best in a fresh session) |
| `root-cause` | bug report → root cause (reproduction required, red test, minimal fix, full suite) |
| `stand-acceptance` | acceptance on the project's live stand: login, token, API/UI in a browser, logs/DB, rebuild (RU, sanitized) |
| `tech-writer` | code+specs → up-to-date specs and a user manual: code ↔ spec drift audit (amendments only via Amendments, after approval) + a manual `md → standalone html + pdf` with screenshots from the stand |
| `kb-index` | documentation corpus → `.kbindex/`: an index of document faces + directory maps, two-tier `kb.mjs search` (the "face" first, then BM25 over section bodies) with the `§<heading>:<line>` anchor, a `related`/`path` graph over links and relations; the Stop hook does not release a turn with a stale index |
| `codestyle` *(cross-cutting)* | repository conventions → `CODESTYLE.md`: rules with `file:line` evidence, anti-echo (regeneration only from code), generate/verify modes; the SessionStart hook reminds about staleness |
| `lazy` *(cross-cutting)* | a behavioral overlay for any coding: the minimal complete change, the reuse ladder, no deliberation loops |

Each spec is the contract input of the next skill; decisions are made and recorded at
the top, everything below only executes. Specs are living documents: deviations during
implementation travel up the chain (local ones — rulings in the report; behavior/contract
changes — a user-approved amendment to the spec via the Amendments section; a changed
intent — back to brainstorm), so the spec and the code never drift apart silently. The
routine loop of this upkeep is `tech-writer`: an audit of "code ↔ specs" over a commit
range and a rebuild of the user manual from the updated specs.

**Feature artifact navigation**: all specs, acceptances, and plans live in the target
repository's `docs/specs/` and `docs/plans/` and carry the topic slug from the business
spec — `YYYY-MM-DD-<topic>*` (`-implementation`, `-<repo>`, `-<repo>-review` for specs,
`<repo>` for plans). The whole chain of one feature is one glob away:
`ls docs/specs/*<topic>* docs/plans/*<topic>*`; in addition, the header of each spec
carries direct links to its parent specs. Spec YAML metadata (`id`/`parent`/`children`)
is bidirectional: the skill creating a downstream artifact immediately appends its id to
the parent's `children` (for multi-leaf system analysis — to the `children` of the
package's README page); `children: []` on a parent that has child documents is a
traceability defect — spec-review and tech-writer check for it.

## Structure

```
.claude-plugin/plugin.json   Claude Code plugin manifest
package.json                 pi package manifest (pi.skills / pi.extensions)
skills/                      pipeline skills (the same ones for both programs); each is self-contained — its CLI and domain cores live in skills/<name>/scripts/
hooks/                       Claude Code hooks: spec-gate (edits outside the plan — blocked), skill-gate (fast profile at skill invocation), secrets-guard (secrets at the git boundary — blocked), vuln-guard (semgrep on commit/edits), git-watch (a signal after tree-changing git operations), format-guard + lint-guard (formatter and linter after an edit), plan-context (plan context at session start), codestyle-reminder (stale CODESTYLE.md reminder), kb-gate (a Stop block on a stale documentation index); docs and contract — hooks/README.md
extensions/                  the same rules for pi agent (TypeScript): spec-gate.ts, secrets-guard.ts, vuln-guard.ts, format-guard.ts, lint-guard.ts, plan-context.ts
docs/                        templates and service documents (not loaded by the agent)
scripts/                     plugin helper scripts (copy-skills.sh); skill CLIs live in the skill directories — skills/<name>/scripts/
```

## Hooks (Claude Code) and extensions (pi)

One logic, two wrappers (`hooks/lib/*.mjs` + adapters). Details and the plan contract:
`hooks/README.md`; the extension API — `extensions/README.md`.

| Hook | When | What it does |
|---|---|---|
| `spec-gate` | before Edit/Write | blocks code edits outside the files of **open** tasks of a `docs/plans/` plan. Modes — the `.spec-gate` file at the project root: `soft` (default; active only with an active plan), `hard` (blocks code even without a plan — run the pipeline first), `fast` (the file gate as in `soft` + the process profile: fast lane by default), `off` |
| `skill-gate` | skill invocation (Skill) | in the `fast` profile blocks autonomous launch of brainstorm / system-thinking / decompositor — small tasks go through the fast lane (a mini-spec in the header of a one-task plan); an explicit user request — via temporarily switching the profile to `soft`; silent in the other modes |
| `secrets-guard` | before Bash | blocks `git add` of sensitive files (`.env`, keys, credentials; `git add .`/`-A` are checked against the index, `.env.example` is allowed) and `git commit`/`git push` with secrets in the diff (two pattern tiers: definite/likely); legitimate fixtures — a regex in `.secrets-allow` at the root; a finding never echoes the secret's value; `git -C <dir>` is checked against the given directory |
| `vuln-guard` | before Bash (git commit); optionally after Edit/Write | semgrep over the commit's staged files — findings block; no semgrep on PATH — silent. `.vuln-guard` at the root: `always`/`edit` = scan edits too, `off` = the hook is fully off; false positives — `# nosemgrep:` / `.vuln-allow` |
| `git-watch` | after Bash | after tree-changing git operations (commit/checkout/merge/rebase/pull/reset/cherry-pick/stash pop) it reconciles derived artifacts with the disk: the kb-index index — a signal to rebuild (a data derivative), CODESTYLE.md — a signal to ask the user (the document is committed); silent when everything is fine |
| `format-guard` | after Edit/Write | runs the project's formatter (prettier / ruff — if the project declares them), auto-fixes what it can; unfixable errors (syntax) are returned to the agent to repair |
| `lint-guard` | after Edit/Write | the project's linter (eslint / ruff / ktlint — if the project declares them) with `--fix`: auto-fixes, returns the remaining violations to the agent |
| `plan-context` | session start | injects a brief orientation into the context: the active plan, open tasks, the spec-gate mode; with the `fast` profile — also the profile block, even without a plan; with `.spec-gate` — an onboarding line about a missing `CODESTYLE.md` / kb-index index; silent without a plan and at `off` |
| `codestyle-reminder` | session start | if `CODESTYLE.md` sits at the root: counts code commits from the recorded `base` (the threshold — 30 code commits or 30 days) and injects a single reminder line; **never blocks**; the staleness verdict — `skills/codestyle/scripts/codestyle.mjs status` |
| `kb-gate` | Stop | reconciles the documentation index (`.kbindex/index.json`) with the disk by hashes: a document changed, appeared, or disappeared — the end of the turn is blocked with a rebuild command; without an index, at `stop_hook_active`, and on any error — silent |

All are fail-safe: a hook failure never blocks work. `docs/**` and `*.md` are always
editable under spec-gate. The plan contract — `hooks/README.md`: sections
`### Task`/`### `, task files from `- Files:`/`- :` (globs are supported; a
line whose paths cannot be parsed — a block with an explanation, not a silent opening),
task closure — an explicit `- Done:` line (checkboxes `- [x]` are progress, not closure;
the plan template contains no `- Done:` line). The `.spec-gate` mode file is also under
the gate while a plan is open: the agent does not lift the gate itself, the user changes
the mode. Boundaries: no hook checks edit semantics against the spec — that is
`spec-review`'s job; spec-gate looks only at the target file and does not intercept
edits made through Bash; secrets-guard, by contrast, works precisely on Bash, but only
on git commands.

## Installation

### Claude Code

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install feature-mastering@specialist-skills
```

To try it without pushing: `/plugin marketplace add <local path to the repository>`.

### pi agent

```bash
pi install git:github.com/buga-man/specialist.git   # bundle: all plugins of the repository
# or a single plugin from a clone:
pi install ./feature-mastering
```

Updating: `pi update`. Pinning a version — by tag: `git:...skills.git@v<release-tag>`.

### Skills only, without installing the plugin

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist/feature-mastering
bash scripts/copy-skills.sh claude   # → ~/.claude/skills
bash scripts/copy-skills.sh pi       # → ~/.pi/agent/skills
bash scripts/copy-skills.sh agents   # → ~/.agents/skills (cross-harness)
```

Existing skills are not overwritten without confirmation. The target can also be an
arbitrary directory: `bash scripts/copy-skills.sh .claude/skills` (project-level skills).

## How to add a skill

1. Copy `docs/skill-template/` to `skills/<skill-name>/`.
2. Fill in `SKILL.md`: `name` — matches the folder name (kebab-case, up to 64 characters);
   `description` — up to 1024 characters, the main autoload trigger ("what it does and
   when to apply it").
3. The skill must be portable — no machine-specific paths, credentials, or settings.
   Host-specifics: Claude Code hooks → `hooks/`, pi extensions → `extensions/`.
   Skill scripts live in the skill's directory (`skills/<name>/scripts/`), paths in
   SKILL.md are relative (`<skill-dir>`); `${CLAUDE_PLUGIN_ROOT}` and other host
   variables are forbidden in SKILL.md.
   Command-and-project skills (like `stand-acceptance`, tied to a specific project's
   stand) are allowed — with an explicit scope in the description.
4. Test in both programs, bump the plugin version, and commit.

Skill discovery is recursive: a skill is any directory containing `SKILL.md`.

## How to add a hook

- **Claude Code** → `hooks/hooks.json` (event → matcher → command); shared logic — in
  `hooks/lib/`, the contract and examples — `hooks/README.md`.
- **pi agent** → `extensions/<name>.ts`: `export default function (pi) { pi.on(...) }` —
  see `extensions/README.md`.

## Versioning

- The plugin version is semver in `.claude-plugin/plugin.json` and in the root
  repository's `marketplace.json` entry, changed in sync. A new skill extending the
  pipeline — minor; an edit of a skill's text — patch.
- Stable points — git tags `v*` on the repository.
