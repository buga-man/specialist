# specialist

The repository is the **specialist** plugin: a full-cycle feature development framework
for **Claude Code**, **ZCode**, **pi agent**, **Codex CLI**, and **OpenCode** — from a raw task to
spec-driven code and up-to-date documentation. Skills are written once and work in every
host (the shared Agent Skills format); installation uses each host's native mechanisms,
and the skills can be used without installing the plugin.

## Pipeline

```
task → brainstorm → business spec
      business spec → system-thinking → system spec (repositories, contracts, rollout)
            system spec → decompositor → repo spec (files, patterns, tests, repo docs)
                  repo spec → implementation-plan → task plan (tasks for the agent)
                        task plan → spec-implementation → code (tests first, the spec as the oracle)
                              code → spec-review → acceptance (criterion by criterion, verdicts with evidence)
                                    unverifiable → stand-acceptance (live acceptance on the stand)
                                    deeper pass on demand → code-review (quality & logic) / bug-hunt (bugs & security)

the spec side of QA (shift left):
      spec → test-analysis → gaps report (holes, missed criteria, corner-case axes) → amendments
      accepted criteria → test-design → cases artifact (TEST-IDs, grader-typed, executable)
      the defect queue → defect-triage → verified, classified, routed rows

after merge / before release → tech-writer → docs audit (code ↔ specs, amendments via Amendments)
                                            + user manual (md → html + pdf, screenshots from the stand)

bugs → root-cause → reproduction → root cause → red test → minimal fix
      (risky fix → spec-review in a fresh session)

small tasks → fast lane → mini-spec + one-task plan (one artifact) → code → batch spec-review
      (profile `fast` in .spec-gate: stage skills — only on an explicit user request)
```

| Skill | Input → Output |
|---|---|
| `brainstorm` | raw task → business spec (no code; ≤10 questions per round ordered by what they move — scope > security/privacy > UX > technical detail, assumptions proposed below that line; acceptance criteria; business cases as P1/P2/P3 slices where the P1 tier alone is shippable; ≤3 blocking open questions or the picture is not one yet — check-criteria enforces) |
| `system-thinking` | business spec → system spec (which repositories change, contracts, blast radius; architecture changes are always explicit; contracts carry a completeness checklist and breaking/additive classification) |
| `decompositor` | system spec → repo spec (change sites, repo patterns, anchor snippets) |
| `implementation-plan` | repo spec → task plan for the agent (vertical slices, Verify "command → expected result", one task = one commit) |
| `change-impact` | planned change → blast radius before the edit (six questions in order — code, data, interfaces, tests, docs, release; a written before-list) · diff vs promised scope after (outside it — justify or revert; a silently dropped before-item is a finding) |
| `spec-implementation` | plan → code (tests first, the spec as the oracle: spec > test > code; three-tier deviations; a self-review pass against the reviewers' checklists before the report) |
| `spec-review` | code → acceptance against the specs (criterion by criterion: passed/failed/unverifiable with evidence; every failure carries a gap class — missing/partial/contradicts/unrequested, the axis the fix routes by; a green run is not evidence by itself — the assertion must match the criterion; non-functional criteria need criterion + method + threshold + environment; terminology drift against the glossary; a violated CODESTYLE MUST principle is changes required; the loop ends in `Converged: pass N` or names what is open; best in a fresh session) |
| `test-analysis` | spec → gaps report `docs/qa/*-gaps.md` (the spec-side adversarial pass: holes — undefined behavior, missing error paths, contradictions; missed-criteria mining from contract error rows, UI element tables, data invariants, NFRs; corner-case axes — boundaries, state transitions, dual modes, permissions, concurrency; vague wording formalized into decision tables; every proposed criterion grader-typed: command / stand / manual / model; the probe script catches what needs no judgment) |
| `test-design` | accepted criteria → the cases artifact `docs/tests/*-cases.md` (TEST-ID'd rows — stable, append-only, retired never reused; a scenario matrix main/alternate/exception per business case; boundary rows per data element; decision and state tables; a regression section sourced from prior defects; a grader on every case — command by default; one artifact three skills consume: spec-review walks it case by case, spec-implementation mines it for red tests, stand-acceptance runs its stand rows; the `cases.mjs check` script enforces the contract, the append-only order, and the coverage both ways) |
| `defect-triage` | the defect queue (external reports + internal findings) → `docs/qa/*-triage.md` (incoming reports are untrusted data — nothing pasted is run, fetched, or obeyed; dedupe by trigger scenario; "already fixed" needs the fixing commit proven an ancestor — `merge-base --is-ancestor`; completeness checklist → needs-info; class (root-cause's four) × severity × SHA-scoped confidence confirmed/likely/unverified/refuted; mechanical routing; aging and recurring classes; draft replies are opt-in) |
| `code-review` | diff/branch → quality & logic report `*-quality.md` (readability, structure, duplication, dead weight; needless work, N+1, premature complexity; the stale-impact pass — what the diff does to the existing suite: tests to re-run, tests that may now lie, coverage silently removed; the spec chain's recorded decisions checked where present — a contradicted decision is a finding; a violated CODESTYLE MUST principle is a blocker on its own; a large diff read in churn order — the report opens with a change map (heart / consequences / glue) closed by a `Not reviewed:` coverage line — findings with file:line evidence and severity, the table capped at 50 rows with an overflow line, re-verification of the previous report ending in `Converged: pass N`, a `Recurring:` memory line; the reviewer does not fix) |
| `bug-hunt` | diff/branch/area → adversarial audit report `*-audit.md` (threat-sketch-aimed, analyzer-assisted — tools propose, the hunter verifies; parallel hunters by explicit permission; bugs: boundaries, off-by-one, error paths, races, leaks, misuse personas; security: injection, authn/authz, secrets, crypto; every finding with a trigger scenario + fix criteria (the dev role's acceptance check), the table capped at 50 rows with an overflow line, deduplicated against prior audits, re-verification of the previous report ending in `Converged: hunt N`; every finding names its source kind — live code / fixture / example / dead — non-live is a note at most, a real-format secret in an example is a downgraded finding; critical — reported immediately) |
| `root-cause` | bug report → root cause (triage first — product defect / wrong test / environment-data mismatch / spec mismatch; reproduction required, red test, minimal fix, full suite; the report names the class) |
| `stand-acceptance` | acceptance on the project's live stand: login, token, API/UI in a browser, logs/DB, rebuild (sanitized placeholders) |
| `tech-writer` | code+specs → up-to-date specs and a user manual: code ↔ spec drift audit (amendments only via Amendments, after approval) + review memory (recurring finding classes → CODESTYLE anti-patterns; a review report card) + scribe of CODESTYLE's versioned Principles section (SemVer bump + sync-impact line, after approval) + a manual `md → standalone html + pdf` with screenshots from the stand |
| `trace-audit` | docs/specs + docs/plans → the pipeline's broken promises (`*-trace.md`): the walk script (walk.mjs) catches what needs no judgment — must criteria without a runnable `Verify:`, parent/children desync, dead links, TEST-ID reuse across the registry, plans blocked on already-resolved questions, draft status outgrown; the judgment checks add implementation shipped without a review and findings that never closed across reports — every finding routed to its owning role; reports only |
| `kb-index` | documentation corpus → `.kbindex/`: an index of document faces + directory maps, two-tier `kb.mjs search` (the "face" first, then BM25 over section bodies) with the `§<heading>:<line>` anchor, a `related`/`path` graph over links and relations; the gates in Claude Code, Codex, and pi do not release a turn with a stale index; `audit` reports broken links, orphans, and stale drafts |
| `codestyle` *(cross-cutting)* | repository conventions → `CODESTYLE.md`: rules with `file:line` evidence, anti-echo (regeneration only from code), generate/verify modes; the SessionStart hook reminds about staleness |
| `lazy` *(cross-cutting)* | a behavioral overlay for any coding: the minimal complete change, the reuse ladder, no deliberation loops |
| `scouts` *(cross-cutting)* | the subagent protocol behind every fan-out — parallel read-only recon and verification under an explicit grant: one question asks permission and count (`.spec-gate`'s `scouts: <N>` answers it standing), the granted count is the hard budget, no answer or no host support → the same missions sequentially; mission charters (one mission per scout, artifact paths not pastes, never pre-judged), fan-in (reports are hypotheses until re-verified, dedup by scenario, a silent scout is chased), read-only, no recursion |
| `bootstrap` *(cross-cutting)* | repository → framework-ready: surveys what exists, proposes and creates the confirmed pieces (`.spec-gate`, `docs/specs/` + `docs/plans/`, `CODESTYLE.md` via codestyle, optional `.suite-gate` / `.kbindex/`); legacy documentation migrates under the port-never-rewrite rule (pilot first, the user reviews); idempotent, confirm-before-create, no commits |
| `retro` *(cross-cutting)* | a session / feature run / release → environment improvements: mechanical friction → a deterministic check (build-first — a check the repo runs beats a rule the agent must remember), judgement friction → a CODESTYLE convention; an existing-but-unwired check is the finding; the no-op hunt; the user picks from the proposal table, wiring lands where it executes — the mistake cannot happen the same way again |

**Roles.** The same pipeline ships as three skills-only role plugins — `specialist-analyst`,
`specialist-dev`, `specialist-qa` — alongside the full bundle. `dispatch` classifies a
task by role before any work starts; `role-analyst` / `role-dev` / `role-qa` are the
roles' entry skills (mission, working cycle, principles, switching); `.spec-gate` can pin
the session to one role (`role: qa`) — the skill-gate then blocks out-of-role skills
until the user consents to a switch. [Installation by role](#roles-analyst--developer--qa).

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
`-<repo>-quality` / `-<repo>-audit` for code-review / bug-hunt reports, `<repo>` for
plans). The whole chain of one feature is one glob away:
`ls docs/specs/*<topic>* docs/plans/*<topic>*`; in addition, the header of each spec
carries direct links to its parent specs. Spec YAML metadata (`id`/`parent`/`children`)
is bidirectional: the skill creating a downstream artifact immediately appends its id to
the parent's `children` (for multi-leaf system analysis — to the `children` of the
package's README page); `children: []` on a parent that has child documents is a
traceability defect — spec-review and tech-writer check for it.

## Structure

```
.claude-plugin/plugin.json       Claude Code plugin manifest
.claude-plugin/marketplace.json  marketplace wrapper: the full plugin (source "./") + the three role plugins (source "roles/<role>") — what /plugin install lists
plugin.json                      Codex agent-plugin manifest (Agent Plugins v1): points Codex at skills/ and hooks/hooks-codex.json
.zcode-plugin/plugin.json        ZCode plugin manifest: points ZCode at skills/ and hooks/hooks.json (ZCode speaks the Claude Code hook protocol, so the Claude Code adapters run unchanged)
package.json                     pi package manifest (pi.skills / pi.extensions)
roles/                           the three role plugins (specialist-analyst / specialist-dev / specialist-qa): skills-only, generated from scripts/roles.mjs + skills/ and committed; compliance --fix rebuilds them on drift
skills/                          pipeline skills (the same ones for every host); each is self-contained — its CLI and domain cores live in skills/<name>/scripts/
hooks/                           the hooks: hooks.json registers them in Claude Code, hooks-codex.json in Codex; the shared cores and adapters live in hooks/lib/ — spec-gate (edits outside the plan — blocked), skill-gate (fast profile and role pin at skill invocation), bash-policy (the provably read-only commands are auto-approved), mutation-guard (agent-run pushes and history rewrites — blocked, opt-in), secrets-guard (secrets at the git boundary — blocked), vuln-guard (semgrep on commit), suite-gate (a red suite from .suite-gate blocks the commit — opt-in), config-guard (an edit of an existing linter/formatter config — blocked), edit-guard (after an edit: boundary notes, formatter, linter, opt-in semgrep — one adapter, one order), git-watch (a signal after tree-changing git operations), plan-context (plan context at session start), codestyle-reminder (stale CODESTYLE.md reminder), kb-gate (a Stop block on a stale documentation index); docs and contract — docs/hooks.md
extensions/                      the same rules for pi agent (TypeScript): spec-gate.ts, secrets-guard.ts, vuln-guard.ts, suite-gate.ts, edit-guard.ts, plan-context.ts, git-watch.ts, codestyle-reminder.ts, kb-gate.ts
plugins/opencode/                the OpenCode plugin (TypeScript, V2 API + a V1 server() fallback) — the same guards on the same cores
docs/                           documentation: skills, hooks, installation; design notes; the skill template
scripts/                         helper scripts: copy-skills.sh (supports --role), roles.mjs (the roles map + the generator's source of truth), compliance.mjs — the self-audit (`npm run compliance`): strict SKILL.md frontmatter, docs parity, the router sync (dispatch names only real skills and every role entry), the fresh-context rule on every scout-dispatching skill, the generated docs/skill-index.md and roles/; check-extensions.mjs — the TypeScript-surface guard (part of npm test); skill CLIs live in the skill directories — skills/<name>/scripts/
```

## Hooks and extensions: one logic, five hosts

One logic (`hooks/lib/*.mjs` cores), four wrappers for five hosts: the Claude Code
adapters, shared verbatim with ZCode (which speaks the same hook protocol — the same
events, matchers, and `${CLAUDE_PLUGIN_ROOT}`), Codex adapters
(JSON output protocol, `apply_patch` support), pi extensions (`extensions/*.ts`), and the
OpenCode plugin (`plugins/opencode/`). Details and the plan contract:
[docs/hooks.md](docs/hooks.md); the pi extension
API — [extensions/README.md](extensions/README.md).

| Hook | When | What it does |
|---|---|---|
| `spec-gate` | before Edit/Write | blocks code edits outside the files of **open** tasks of a `docs/plans/` plan; a plan authorizes code edits only with `status: approved` in its frontmatter — the user approves before code starts, a draft plan gates every code edit (docs stay editable), and the status flip is a boundary edit the diff shows. Modes — the `.spec-gate` file at the project root: `soft` (default; active only with an active plan), `hard` (blocks code even without a plan — run the pipeline first), `fast` (the file gate as in `soft` + the process profile: fast lane by default), `off` |
| `skill-gate` | skill invocation (Skill) | in the `fast` profile blocks autonomous launch of brainstorm / system-thinking / decompositor — small tasks go through the fast lane (a mini-spec in the header of a one-task plan); an explicit user request — via temporarily switching the profile to `soft`. With `.spec-gate` pinning `role: <analyst/dev/qa>` — blocks the other roles' skills until the user consents to a switch (the block points to the dispatch protocol); silent otherwise |
| `secrets-guard` | before Bash | blocks `git add` of sensitive files (`.env`, keys, credentials; `git add .`/`-A`, bare directories and wildcard paths are checked against the index with untracked files expanded, quoted non-ASCII paths unescaped, `.env.example` is allowed) and `git commit`/`git push` with secrets in the diff (two pattern tiers: definite/likely; a push without an upstream — the first push of a branch — scans the commits the remote does not hold); legitimate fixtures — a regex in `.secrets-allow` at the root; a finding never echoes the secret's value; `git -C <dir>` is checked against the given directory |
| `vuln-guard` | before Bash (git commit) | semgrep over the commit's staged files — findings block; no semgrep on PATH — silent. `.vuln-guard` at the root: `always`/`edit` = scan edits too (inside edit-guard), `off` = the hook is fully off; false positives — `# nosemgrep:` / `.vuln-allow` |
| `suite-gate` | before Bash (git commit) | the project's own test command from `.suite-gate` (first line) runs at the commit boundary — a non-zero exit blocks with the tail of the output; spawn error/timeout — no block (fail-safe). Opt-in: no `.suite-gate` — the hook is silent; `off`/empty — disabled |
| `bash-policy` | before Bash | auto-approves the provably read-only commands (`git status/log/diff/show/blame`, listing `git branch`/`git remote`, `ls`, `cat`, `pwd`, `test -e`) — read-only head, workspace-bound paths, no redirection/pipes/substitution, every segment of a `&&`/`;` chain checked; everything else gets no decision and the host's permission flow decides (fail-closed: a parse doubt never widens what is auto-approved; never blocks) |
| `mutation-guard` | before Bash | blocks agent-run `git push`, `reset --hard`, `rebase`, `clean`, `stash drop/clear`, `branch -D`, `checkout --`/`checkout <ref> --`/`restore` discards (`restore --worktree` counts even next to `--staged`), and the hook bypasses (`commit`/`push --no-verify`, `core.hooksPath`) — outward and history-mutating operations run on the user's explicit command, not the agent's initiative; leading global options (`git -c user.name=x push`) do not hide the shape. Commits are not gated (one task = one commit is the framework's loop). Opt-in: silent until `.spec-gate` carries `mutation-guard: on`; unknown shapes and errors — silent (fail-safe) |
| `config-guard` | before Edit/Write | an edit of an **existing** linter/formatter config (eslint, prettier, biome, ruff, stylelint, markdownlint — flat and rc styles) or its ignore file — blocked: relaxing a rule or silencing a path is the user's decision. Creating a config where none exists is allowed (bootstrap); deletion counts as an edit |
| `git-watch` | after Bash | after tree-changing git operations (commit/checkout/merge/rebase/pull/reset/cherry-pick/stash pop) it reconciles derived artifacts with the disk: the kb-index index — a signal to rebuild (a data derivative), CODESTYLE.md — a signal to ask the user (the document is committed); silent when everything is fine |
| `edit-guard` | after Edit/Write | one adapter, one deterministic order: the boundary-visibility notes (an edit of a plan's `- Files:` scope line or of `.secrets-allow`/`.vuln-allow` is called out), the project's formatter (prettier / ruff), the project's linter (eslint / ruff / ktlint, each `--fix`-ing what it can), and — under `.vuln-guard = always` — a semgrep scan; unfixable errors and violations are returned to the agent to repair |
| `plan-context` | session start | injects a brief orientation into the context: the active plan, open tasks, the spec-gate mode; an unapproved plan is named as such (code edits stay blocked until the user approves); with the `fast` profile — also the profile block, even without a plan; with a role pin (`role:` in `.spec-gate`) — the pin line, even in mode `off` (the pin gates skills, not files); with `.spec-gate` — an onboarding line about a missing `CODESTYLE.md` / kb-index index; with no open tasks — the spec-chain line: the newest incomplete chain in `docs/specs/`, its stage and the skill to resume with (derived from the slugs and `status:` metadata — no state file; no marker needed — a `docs/specs/` tree is itself the opt-in); silent at `off` (without a pin), and in soft/hard when no chain is mid-flight and onboarding has nothing to report |
| `codestyle-reminder` | session start | if `CODESTYLE.md` sits at the root: counts code commits from the recorded `base` (the threshold — 30 code commits or 30 days) and injects a single reminder line; **never blocks**; the staleness verdict — `skills/codestyle/scripts/codestyle.mjs status` |
| `kb-gate` | Stop | reconciles the documentation index (`.kbindex/index.json`) with the disk by hashes: a document changed, appeared, or disappeared — the end of the turn is blocked with a rebuild command; without an index, at `stop_hook_active`, and on any error — silent |

All are fail-safe: a hook failure never blocks work. `docs/**` and `*.md` are always
editable under spec-gate. The plan contract — `docs/hooks.md`: sections
`### Task`, task files from `- Files:` (globs are supported, a wrapped list's
continuation lines count; a
line whose paths cannot be parsed — a block with an explanation, not a silent opening;
a plan ending inside an unbalanced code fence — a warning, its swallowed tasks are
named), task closure — an explicit `- Done:` line (checkboxes `- [x]` are progress, not
closure; the plan template contains no `- Done:` line). The `.spec-gate` mode file is
also under the gate while a plan is open: the agent does not lift the gate itself, the
user changes the mode.

**The gates are discipline, not walls.** They catch the accidental — scope creep, a
leaked key, a broken format — not a determined agent: the plan and the
`.secrets-allow`/`.vuln-allow` allowlists are editable, and code can be rewritten
through `sed -i`. The system's answer is visibility: boundary edits produce notes
(edit-guard), and every such change lands in the git diff a reviewer reads. Boundaries:
no hook checks edit semantics against the spec — that is `spec-review`'s job; spec-gate
looks only at the target file and does not intercept edits made through Bash;
secrets-guard, by contrast, works precisely on Bash, but only on git commands (exotic
wrappers — pipes, `bash -c`, aliases — are a documented residual). The per-host
capability matrix: [docs/hooks.md](docs/hooks.md#host-support).

## Documentation

- [Installation and dependencies](docs/installation.md) — all five hosts and skills-only;
  what is needed for full operation, project configuration files, verification after installation.
- [Skills](docs/skills.md) — a human-readable description of all twenty-six skills: why they exist,
  input → output, when they trigger, key rules.
- [Hooks](docs/hooks.md) — all thirteen hooks: events, what they block,
  configuration, boundaries, and fail-safe behavior.
- [kb-index design notes](docs/kb-index-design.md), [codestyle design notes](docs/codestyle-design.md) —
  the design rationale behind the two skills.
- [Plugin schema notes](docs/plugin-schema-notes.md) — the host and marketplace traps the
  repository has already hit: symptom → cause → rule.
- [Not adopted](docs/not-adopted.md) — the why-not ledger: rejected concepts with their
  durable reasons, so the same candidate is not re-litigated every few months.
- [Skill template](docs/skill-template/) — the starting point for a new skill.

## Installation

### Claude Code

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist@specialist
```

To try it without pushing: `/plugin marketplace add <local path to the repository>`.

### ZCode

The repository doubles as a ZCode plugin marketplace (ZCode supports
`.claude-plugin/marketplace.json`), and ZCode speaks the Claude Code hook protocol — the
same adapters run unchanged. In the ZCode app:

1. **Plugin Marketplace → Add → Add Plugin Marketplace** — paste the path to this
   repository.
2. **Personal → specialist → Install**.
3. The hooks register automatically; **Settings → Plugin Management** shows each hook and
   whether it is runnable. Plugin hooks run without a separate trust dialog.

Updating: the marketplace page's gear button → **Marketplace Sources** → refresh this
marketplace, then **Update** in the plugin details.

### pi agent

```bash
pi install git:github.com/buga-man/specialist.git
```

Updating: `pi update`. Pinning a version — by tag: `git:...specialist.git@v<release-tag>`.
After edits/extensions: `/reload` inside pi.

### Codex CLI

```bash
codex marketplace add https://github.com/buga-man/specialist.git
codex plugin add specialist@specialist
```

After installing, review and trust the hooks in the `/hooks` dialog (Codex runs
untrusted hooks only after explicit trust). Without the plugin, the skills work on their
own: `bash scripts/copy-skills.sh codex` (→ `~/.codex/skills`) or any target directory
(e.g. `.codex/skills` inside a project).

### OpenCode

In the target project's `opencode.json`:

```jsonc
{
  "skills":  ["<path to the specialist repository>/skills"],
  "plugins": ["<path to the specialist repository>/plugins/opencode"]
}
```

Both entries accept any path form (absolute, `~/`, `file://`). Without the plugin, the
skills work on their own: `bash scripts/copy-skills.sh opencode` (→
`~/.config/opencode/skills`); the compatibility sources `~/.claude/skills` and
`~/.agents/skills` are picked up automatically.

### Roles (analyst / developer / QA)

The framework ships as three skills-only role plugins alongside the full bundle — install
one role and the session carries only that role's skills:

| Plugin | The role | Skills |
|---|---|---|
| `specialist-analyst` | from a raw task to specs and true documentation | `brainstorm`, `system-thinking`, `decompositor`, `kb-index`, `tech-writer`, `trace-audit`, `role-analyst` |
| `specialist-dev` | from a repo spec to spec-driven code | `implementation-plan`, `change-impact`, `spec-implementation`, `codestyle`, `lazy`, `root-cause`, `role-dev` |
| `specialist-qa` | probe the specs, design the cases, prove the work, triage the queue | `test-analysis`, `test-design`, `spec-review`, `stand-acceptance`, `code-review`, `bug-hunt`, `defect-triage`, `role-qa` |

Every role plugin also carries `dispatch` — the entry point that classifies a task by
role before any work starts and governs switching: roles are switched only with the
user's explicit consent (switch here / a new session with the role / a role subagent /
stay and record the task for the other role) — `scouts` (the subagent protocol behind
every fan-out), `bootstrap`, the cross-cutting repository primer, and `retro`, the
environment-improving retrospective. The role rows above name each role's own skills;
the four shared ones ride in every plugin.

- **Claude Code / ZCode** — the same marketplace, another plugin:
  `/plugin install specialist-qa@specialist`; the ZCode marketplace page lists all four.
  Switching roles day-to-day = enabling/disabling the installed plugins.
- **Codex CLI** — `codex plugin add specialist-qa@specialist`.
- **pi / skills-only** — `bash scripts/copy-skills.sh <target> --role qa` copies only
  that role's skills; **OpenCode** — point `opencode.json`'s `skills` array at
  `roles/qa/skills` inside this repository.
- On Claude Code and ZCode, `.spec-gate` can pin the session to one role (`role: qa`) —
  the skill-gate then blocks out-of-role skills until the user consents to a switch.

Role plugins are skills-only: the guards (spec-gate, secrets-guard, vuln-guard,
suite-gate, edit-guard, …) ship with the full `specialist` bundle. Installing several
roles together is fine (the skill sets do not overlap and roles carry no hooks); do not
combine roles with the bundle — the skill names collide. The `roles/` trees are generated
from `scripts/roles.mjs` — `node scripts/compliance.mjs --fix` rebuilds them.

### Skills only, without installing the plugin

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist
bash scripts/copy-skills.sh claude   # → ~/.claude/skills (read by Claude Code and OpenCode)
bash scripts/copy-skills.sh pi       # → ~/.pi/agent/skills
bash scripts/copy-skills.sh agents   # → ~/.agents/skills (read by pi and OpenCode)
bash scripts/copy-skills.sh codex    # → ~/.codex/skills
bash scripts/copy-skills.sh opencode # → ~/.config/opencode/skills
```

Existing skills are not overwritten without confirmation. The target can also be an
arbitrary directory: `bash scripts/copy-skills.sh .claude/skills` (project-level skills).
In this mode hooks and extensions are **not** installed — skills only.

## How to add a skill

1. Copy `docs/skill-template/` to `skills/<skill-name>/`.
2. Fill in `SKILL.md`: `name` — matches the folder name (kebab-case, up to 64 characters);
   `description` — up to 1024 characters, the main autoload trigger ("what it does and
   when to apply it"). The template carries three optional sections — **Boundaries**
   (can do autonomously / requires confirmation / will not do), **Troubleshooting**
   (symptom → likely cause → what to do), and **It's working if** (observable success
   criteria with their failure tells) — add them when the skill's scope is easy to
   overstep, it has known failure shapes, or its success is observable.
3. The skill must be portable — no machine-specific paths, credentials, or settings.
   Host-specifics: Claude Code and Codex hooks → `hooks/`, pi extensions → `extensions/`, OpenCode → `plugins/opencode/`.
   Skill scripts live in the skill's directory (`skills/<name>/scripts/`), paths in
   SKILL.md are relative (`<skill-dir>`); `${CLAUDE_PLUGIN_ROOT}` and other host
   variables are forbidden in SKILL.md.
   Command-and-project skills (like `stand-acceptance`, tied to a specific project's
   stand) are allowed — with an explicit scope in the description.
4. Assign the skill to a role in `scripts/roles.mjs` (a role list, or `shared` for the
   skills every plugin carries) and regenerate the role trees:
   `node scripts/compliance.mjs --fix`.
5. Test in the hosts you target: `npm test && npm run compliance` must pass (the
   compliance audit validates the frontmatter, the docs parity, the roles map, and
   regenerates `docs/skill-index.md` and `roles/` via `--fix` when they are stale;
   `skill-size` keeps every SKILL.md within one capped read — 220 lines / 13 KB —
   and its local links resolving). A new or heavily rewritten skill gets one
   clean-room run before release: a fresh agent session that sees only its
   SKILL.md, a scratch folder outside this repository, a real task from its
   domain — judged by what the agent does, not by what the text says (CODESTYLE §6).
   Then bump the plugin version, and commit.

Skill discovery is recursive: a skill is any directory containing `SKILL.md`.

## How to add a hook

- **Claude Code** → `hooks/hooks.json` (event → matcher → command); shared logic — in
  `hooks/lib/`, the contract and examples — `docs/hooks.md`.
- **Codex** → the adapter in `hooks/lib/` (a `-codex` twin when the output protocol
  differs) + a matcher group in `hooks/hooks-codex.json`; the root `plugin.json` points
  Codex at it.
- **pi agent** → `extensions/<name>.ts`: `export default function (pi) { pi.on(...) }` —
  see `extensions/README.md`.
- **OpenCode** → `plugins/opencode/index.ts` (V2 `Plugin.define` + a V1 `server()`
  fallback) on the same cores.

## Versioning

- The plugin version is semver, kept in sync in every manifest field (enforced by
  `npm test`): `.claude-plugin/plugin.json`, `plugin.json` (the Codex manifest),
  `.zcode-plugin/plugin.json` (the ZCode manifest), `package.json` (the pi package), the
  version fields of `.claude-plugin/marketplace.json` (`metadata`, every plugin entry,
  the marketplace root), and the generated manifests of the role plugins
  (`roles/<role>/plugin.json` — rebuilt from `package.json` by compliance `--fix`).
  A new skill or hook — minor; an edit of a skill's text — patch.
- Stable points — git tags `v*` on the repository.

## Links

- The Agent Skills format (shared by every host): https://agentskills.io
- The Agent Plugins manifest (Codex): https://agent-plugins.org
- OpenCode documentation (skills / plugins): https://opencode.ai/docs
- Codex documentation (skills / hooks): https://developers.openai.com/codex
- pi documentation (skills / packages / extensions):
  https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs
- Claude Code documentation (plugins): https://code.claude.com/docs/en/plugins

### Sources

The public projects several ideas were adapted from. This section is the attribution
record: the repository's documents and skills carry no donor names by policy and are
written from scratch — no donor text, code, or skills ship here.

- [Clean Code for AI Agents](https://akitaonrails.com/en/2026/04/20/clean-code-for-ai-agents/)
  — code's primary reader is an agent: why-comments, headless tests, agent readability (v0.29.0)
- [mattpocock/skills](https://github.com/mattpocock/skills) — the interview frontier, the
  red-capable-loop diagnosis gates, tracer-bullet tickets (v0.41.0)
- [obra/superpowers](https://github.com/obra/superpowers) — the subagent dispatch doctrine (v0.38.0)
- [affaan-m/ecc](https://github.com/affaan-m/ecc) — issue-review, eval-harness graders,
  TEST-ID collaboration (v0.32.0, v0.37.0, v0.38.0)
- [github/spec-kit](https://github.com/github/spec-kit) — gap classes, the convergence
  contract, question budgets, the versioned principles (v0.39.0)
- [backnotprop/plannotator](https://github.com/backnotprop/plannotator) — the change map,
  the skill-size cap (v0.40.0)
- [affaan-m/agentshield](https://github.com/affaan-m/agentshield) — source-kind, the
  false-positive feedback loop (v0.40.1)

## Principles

The frame everything above hangs on:

- **Minimal surface** — few precise skills; every one earns its place.
- **Documents are data** — specs, plans, and reports carry no executable authority;
  nothing runs on a document's say-so alone.
- **Evidence over claims** — a finding cites `file:line`; a pass cites a green run.
- **Ceremony scales with blast radius** — a trivial change skips the parade; a
  cross-repo contract never takes the fast lane.
- **Fail closed** — an unsure agent stops and asks; it never guesses.
