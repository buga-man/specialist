# Skills: what each of the eighteen does

A pipeline for the full feature development cycle — from a raw task to code backed by a
spec and up-to-date documentation. Each skill is a separate role with a clear input and
output; the output of the previous stage is the contractual input of the next. Decisions
are made at the top (in the specs) and recorded; at the bottom they are only executed.

```
task → brainstorm → business spec
      business spec → system-thinking → system spec (repos, contracts, rollout)
            system spec → decompositor → repo spec
                  repo spec → implementation-plan → a task plan for an agent
                        plan → spec-implementation → code (tests-first, the spec is the oracle)
                              code → spec-review → acceptance (criterion by criterion)
                                    unverifiable → stand-acceptance (live acceptance on the stand)
                                    deeper pass on demand → code-review (quality & logic) / bug-hunt (bugs & security)

after merge / before release → tech-writer → spec audit + user manual

bugs → root-cause → reproduction → root cause → red test → minimal fix

documentation map → kb-index → index + maps (search by the document's "face")

repo conventions → codestyle → CODESTYLE.md (mimicry: agent code is indistinguishable from developer code)
```

`lazy` is not a stage but a behavioral overlay for any coding.

## Roles: how the skills ship

The same pipeline installs as one full plugin or as three skills-only role plugins —
install a role and the session carries only that role's skills. `dispatch` (in every
plugin) classifies a task by role before any work starts; `role-analyst` / `role-dev` /
`role-qa` are the roles' entry skills. Roles are switched only with the user's explicit
consent — the options live in `dispatch`.

| Plugin | The role | Skills |
|---|---|---|
| `specialist-analyst` | a raw task to specs and true documentation | brainstorm, system-thinking, decompositor, kb-index, tech-writer, trace-audit, `role-analyst` |
| `specialist-dev` | a repo spec to spec-driven code | implementation-plan, spec-implementation, codestyle, lazy, root-cause, `role-dev` |
| `specialist-qa` | acceptance, review, bug hunting | spec-review, stand-acceptance, code-review, bug-hunt, `role-qa` |
| `specialist` (full) | the whole cycle + the guards (hooks) | all of the above |

The role plugins are generated from the roles map (`scripts/roles.mjs`) — one source of
truth for the plugins, the role profile of the skill-gate, and `copy-skills.sh --role`.
On Claude Code and ZCode, `.spec-gate` can pin the session to one role (`role: qa`) —
out-of-role skills are then blocked until the user consents to a switch.

## Principles of the whole system

- **The spec is the oracle.** Priority: spec > test > code. On a mismatch, the code/test
  is fixed, not the spec.
- **Nothing silent.** Deviations during implementation follow three tiers: local — a ruling
  in the report; behavior/contract/scope — a user-approved amendment to the spec (the
  Amendments section); changed intent — back to brainstorm.
- **Evidence, not impressions.** Acceptance verdicts and audit findings cite a test, a place
  in the code, or observed behavior. "Looks fine" is not a verdict.
- **The reviewer does not fix, the writer does not edit silently** — role independence
  matters more than speed.
- **Scouts by explicit permission.** The recon-heavy skills (brainstorm, system-thinking,
  decompositor) — and bug-hunt's parallel hunters — may parallelize research with
  read-only subagent scouts — but only after
  asking the user: may scouts be used here, and how many. The granted count is the hard
  budget; without subagents (denied or unsupported) the same missions run sequentially.
- **Slug navigation.** All artifacts of a feature carry its slug: `docs/specs/YYYY-MM-DD-<topic>*`
  (business spec, `-implementation`, `-<repo>`, `-<repo>-review`; review reports —
  `-<repo>-quality`, `-<repo>-audit`) and `docs/plans/YYYY-MM-DD-<topic>-<repo>.md`. The
  whole chain is one glob: `ls docs/specs/*<topic>* docs/plans/*<topic>*`.
- Content is written in the team's working language; the skills themselves are in English.

---

## brainstorm — raw task → business spec

**Why:** tasks arrive as three lines hiding half the requirements. The skill surfaces them:
it studies the docs and the system, asks the user at most 10 questions per round (two
rounds at most, only those whose answers change the spec), and turns it all into a
business spec.

- **Input → output:** raw task → `docs/specs/YYYY-MM-DD-<topic>.md`
- **In the spec:** business meaning without code (no paths, APIs, schemas), scope/non-scope
  and constraints, must/should acceptance criteria (each with a source `[request]/[docs]/[answer #N]`,
  an EARS shape per references/ears-patterns.md with the quality bar (fail test, discriminating
  power, measurable vocabulary, defined terms; a worked sharpening example included) and — for
  must — a `Verify:` command or an explicit manual check; the mechanical part of the bar is a
  runnable self-check (`node <skill-dir>/scripts/check-criteria.mjs <spec>` — Verify presence,
  vague wording, the 5–20 must band). Business cases "actor → action → outcome" (each covered
  by at least one criterion), a glossary slot for the terms the criteria rely on, success
  metrics, open questions with working assumptions and a blocking flag. **Value-first,
  above the formal bar** — problem, not solution (strip every mention of implementation;
  the need must still stand on its own) and no gold-plating (every criterion traces to
  the stated value; a criterion beyond the need is a finding, not a bonus).
- **When:** any new task/feature; phrases "gather requirements", "make a spec".
- **Not for:** bugs — those belong to root-cause.

## system-thinking — business spec → system spec

**Why:** the main value is finding work the spec is silent about: a frontend for a
"backend task", migrations, compatibility, permissions — and work the spec duplicates:
what was ordered as "new" may already exist in a neighboring repo. Reconnaissance of all
affected repositories, blast radius, contracts between repos (each with its owning contract test), data migration and rollback, rollout order.

- **Input → output:** business spec → `docs/specs/YYYY-MM-DD-<topic>-implementation.md`
- **Key rule:** architectural decisions and behavior changes are **always** discussed with
  the user explicitly (alternatives + trade-offs + a recommendation) — never slipped in as
  a "default". Decisions are recorded in a fixed shape — context → decision →
  alternatives rejected (each with the reason it lost) → consequences — and are
  **append-only** (a superseded decision gets a new record referencing the old, never an
  edit). Every change is traced with certainty: `[spec]/[found] (file:line)/
  [assumption: why]/[ambiguous]`; sibling-spec needs go to `depends-on` with a reason.
- **Irreversible decisions** (public contracts, schemas, migrations, removals) are a
  separate sub-list in Decisions — each with the date, the rejected reversible
  alternative, and the revert cost; they outlive the feature and are read first
  downstream.
- **When:** "system analysis", "how do we implement this", "which repositories are affected".

## decompositor — system spec → repo specs

**Why:** makes each repo concrete: exact modules and files, this repo's patterns, short
anchor snippets (not implementations!), tests in the repo's conventions, where to expect
changes from. It also folds the repo's aging docs into the changes.

- **Input → output:** system spec → one `docs/specs/YYYY-MM-DD-<topic>-<repo>.md` per repository
- **Key rule:** within a repo — allowed; contracts and cross-repo decisions — not allowed:
  contradictions are raised up to system-thinking, not "fixed" locally.
- **New means searched first:** an entity declared new (a function, class, endpoint, role,
  setting) is searched for across the repo first; found — extend/reuse; not found —
  `searched: <what, where>` in the spec. Otherwise a duplicate ordered by the spec will pass
  acceptance as passed. Changes serving a business criterion carry `Verify:`; lateral needs
  go to `depends-on`; the spec names its ambiguity policy (halt and ask / skip and report).
- **When:** "split by repository", "decomposition", "what changes in this repo".

## implementation-plan — repo spec → a task plan for an agent

**Why:** the plan is written for an executor with fresh context: task + repo spec = all it
needs. Written plans survive session boundaries and compaction — plans in a head do not.

- **Input → output:** repo spec → `docs/plans/YYYY-MM-DD-<topic>-<repo>.md`
- **Task format (machine-readable, parsed by spec-gate):** `### Task N`, `- Files:`
  (paths in backticks, on one line, globs allowed), action steps, `Verify` with the exact
  command and expected result, `Commit`; optional `Risk:`/`Revert:`/`Criteria:`/`Verify (red):`
  per task; plan-level `## Revert` (reverse-order undos + post-rollback verify), a final
  full-suite task, an optional `## Decision log`. One task = one commit. The hook reads only
  `### Task`, `- Files:`, and `- Done:` from this (added by the executor on closure) —
  the rest is for the executor agent and spec-review, not the parser.
- **Key rule:** the plan makes no decisions — it lays out decisions already made.
  A hole in the spec → stop and escalate, not "fill it in".
- **Branch line:** the plan names its branch (`- Branch:`); the executor creates it
  before Task 1 and every task commit lands there, so spec-review diffs one branch
  against its base; a risky plan may isolate in a dedicated worktree.
- **When:** "make an implementation plan", "break it into tasks", "work plan".

## spec-implementation — plan → code

**Why:** an executor follows the plan, task by task, tests first. A feature/fix gets a red
test before the code; a refactor gets characterization tests that must stay green. Every
new test is proven by failure: break the behavior — the test turns red on an assert —
restore the behavior — it turns green. A test that was never red verifies nothing.

- **Input → output:** plan → commits (one task = one commit, the task is closed with
  `- Done: <hash>` in the plan)
- **Three tiers of deviations:** local (a different way, same behavior) — a ruling in the
  report; behavior/contract/scope — stop, an amendment to the owning spec after approval;
  changed intent — back to brainstorm. An open spec question blocks its own slice, not
  the whole plan — blocked tasks are marked `- Blocked by:` in the plan (destructive,
  security, and outward operations halt everything, full stop).
- **Why-comments stay:** context comments (the bug behind a workaround, a business
  constraint, a dated decision, a commit reference) are preserved and updated, never
  stripped as clutter — they are the repo's memory for the next reader, agent included.
- **Self-review (after the last task):** the branch diff walked against the reviewers'
  checklists (bug-hunt's, code-review's) — the trivial fixed on the spot, the
  unresolved edges carried into the report as the reviewer's starting points.
- **Final report:** touched surface first — what the change reaches beyond its obvious
  paths and where regression risk sits (the reviewer's starting map); then decisions the
  specs did not cover; ambiguous readings (the one place a
  human is genuinely needed); rulings; spec amendments; unproven tests; self-review notes.
- **When:** "implement", "execute the plan", "implement per the spec".

## spec-review — code → acceptance

**Why:** independent acceptance against the specs, criterion by criterion. Best in a fresh
session — the author of the code must not be its reviewer. It starts from "everything is
broken until proven otherwise".

- **Input → output:** specs + diff + executor's report → `docs/specs/YYYY-MM-DD-<topic>-<repo>-review.md`
- **Verdicts:** `passed` (with evidence) / `failed` (what differs and where) /
  `unverifiable` (what is needed: a stand, a manual step, a test — handed over as a task,
  not as a hope). A criterion with `Verify:` is checked by running exactly that command;
  a must criterion without a runnable `Verify:` is unverifiable by default and flags a
  spec defect, not a code failure. A criterion without a test and observed behavior is
  unverifiable, never passed. **A green run is not evidence by itself** — the evidence
  is the match between the test's assertions and the criterion (a pass ≠ a verified
  criterion; a green suite over an under-asserting test is unverifiable, and the
  amendment sharpens the test). **Non-functional criteria must be measurable**:
  criterion + measurement method + threshold + environment; missing any → unverifiable,
  and the amendment proposes the four fields.
- **Plus:** a scan for unsanctioned behavior (what the code does beyond the specs), an audit
  of the executor's report, spec-drift (a divergence without an amendment = failed; a stale
  spec — propose an amendment), and the criteria attack: name a plausible wrong implementation
  that would pass every criterion — if one exists, the criteria set gets a proposed sharper
  criterion (amendment), so the trap does not survive into the next feature. Outcome: accepted /
  accepted with notes / changes required.
- **Cycle line:** the report opens with `Cycle: plan date → accepted date (N days)` —
  derived from the slug dates; no state stored (tech-writer's audit aggregates these
  into a cycle-times table).
- **Key rule:** the reviewer does not fix — fixes go back into the plan for the executor;
  bugs go to root-cause.
- **When:** "review the implementation", "accept against the spec", "run acceptance".

## code-review — diff → quality & logic report

**Why:** spec-review proves the code does what the spec ordered; nobody yet asked how
well it is written. The skill reviews readability and the cost of the logic: could a new
developer maintain this code a month from now, and does it do its work without needless
effort.

- **Input → output:** diff (branch against base) + the code around each hunk +
  `CODESTYLE.md` where present → `docs/specs/YYYY-MM-DD-<topic>-<repo>-quality.md`
- **Three passes:** quality — intent vs naming, structure, duplication (new symbols
  grepped against the repo; a duplicate is a finding even when the plan ordered it),
  dead weight, error-handling idioms, tautological tests; logic — needless work, N+1,
  data-structure fit judged against real data sizes, hot vs cold paths, accidental
  complexity — and premature optimization as a finding too; stale impact — what the
  diff does to the existing suite: tests to re-run, tests that may now lie (their
  subject changed under them), coverage silently removed, each tagged
  Must/Should/Optional. A large diff is read in churn order (git log --follow
  frequency, shared modules before leaves) — depth goes where change goes.
- **Findings:** `file:line` + what and why + a proposed direction (not a patch);
  severity blocker / worth fixing / note; outcome clean / worth a pass / rework
  required. Blockers and worth-fixing go back into the plan as tasks.
- **Re-verification and memory:** a previous `*-quality` report opens the pass —
  carried findings get closed / not closed / fixed-with-regression statuses
  (`Re-verified: N closed, M not closed, K regressions`); findings live in a countable
  table and the report ends with a `Recurring:` line — the review memory tech-writer
  aggregates into CODESTYLE anti-patterns.
- **Key rules:** evidence, not impressions; not a linter — what lint configs catch is a
  pointer, never a re-description; severity honesty — a style nit is a note, never a
  blocker; the reviewer does not fix.
- **When:** "review the code quality", "is this well-written", "any needless work
  here", "review the logic" — before merge or on demand; complements spec-review.
- **Not for:** spec compliance (spec-review), bugs and security (bug-hunt).

## bug-hunt — code → adversarial audit report

**Why:** tests prove only what their author thought to check, and the author already
believes the code works. The skill assumes the code is broken and reads twice — as a
destroyer feeding it inputs it did not expect, and as an attacker feeding it inputs it
must never accept.

- **Input → output:** diff / branch / code area, traced to its entry points (handlers,
  CLI, cron, consumers, UI events) → `docs/specs/YYYY-MM-DD-<topic>-<repo>-audit.md`
- **Aiming the hunt:** a 15-minute threat sketch first (assets → who reaches them →
  through which entries), and the installed analyzers (semgrep, linters) as verifiable
  leads — tools propose, the hunter verifies.
- **Bug checklist:** boundaries (empty/null/one/many/negative/max/unicode/timezone),
  off-by-one, error paths (partial failure midway, swallowed errors, retry without
  idempotency), concurrency (shared state, TOCTOU, unawaited promises), resource leaks,
  unasserted invariants, time arithmetic, misuse personas (the novice's random input,
  the power user's shortcuts and double submits).
- **Security checklist:** injection (SQL/command/path traversal/XSS/template/log),
  authn/authz per endpoint (IDOR, privileges from the client), secrets (hardcoded,
  logged, echoed), SSRF, redirects from user input, unsafe deserialization, crypto
  misuse, new dependencies with advisories.
- **Findings:** `file:line` + the trigger scenario (bugs — a reproduction sketch;
  security — an exploitation sketch) + fix criteria (the observation that proves the
  bug fixed — the dev role's acceptance check) + severity critical/high/medium/low;
  **no scenario — no finding**; **dedup on filing** — the same trigger scenario
  already open in a prior audit links and carries its status, never a duplicate row.
  Critical security findings are reported to the user
  immediately; the report never carries live secret values. Outcome: no findings /
  findings listed / exploitable — fix before merge.
- **Parallel hunters (by explicit permission):** a large target may run 2–3
  independent hunters with distinct checklist foci (same scout permission rule as the
  recon skills); the coordinator deduplicates by scenario and resolves disagreements by
  building the scenario. Re-verification statuses and the `Recurring:` line — the same
  memory loop as code-review.
- **Key rules:** the hunter does not fix — fixes go back into the plan (or root-cause
  for a single confirmed bug); a layer, not a substitute — vuln-guard/secrets-guard
  catch the moment of commit, this audits the code itself.
- **When:** "find bugs", "hunt for defects", "audit the security", before a release, on
  a risky diff.
- **Not for:** a known reproducible bug (root-cause), spec compliance (spec-review).

## stand-acceptance — acceptance on a live stand

**Why:** closes the spec-review verdict "unverifiable — check on the live system". Shell
login (token in localStorage + cookies), token minting in an IAM container, direct service
calls, browser acceptance through the host's browser automation, logs and the DB, service rebuilds.

- **Input → output:** an acceptance item → observed behavior on the live stand
- **Key:** credentials and paths live in environment variables; the skill itself carries
  placeholders (sanitized); the subtleties of token invalidation and Windows wrappers are
  collected inside.
- **When:** "check on the stand", "accept on the stand".
- **Limitation:** a team-and-project skill — tied to the stand of a specific project,
  does not generalize.

## tech-writer — up-to-date specs + user manual

**Why:** the documentation loop after merge. Mode 1 — **audit**: compares the code against
the specs from the last sync point (the report `docs/audits/YYYY-MM-DD-doc-sync.md` stores
the hash of the last checked commit — which is also the starting point of the next run) and
finds five kinds of drift: undocumented (code without a spec), stale claim (a spec lies
about the code), orphan amendment (an amendment never reached the manual), unowned feature
(a feature with no spec at all), broken trace (`parent`/`children` metadata desynced along
the chain). Each finding comes with file:line evidence and ready
amendment text; it is applied only after approval, and the report ends with a
cycle-times table (per completed chain: plan date → review date in days, derived from
the slug dates — a metric that costs no state). Mode 2 — **user manual**: a skeleton
from the business specs (business cases → step-by-step how-tos), screenshots from the stand
via browser automation, and building `md → standalone HTML + PDF` with the skill's script
(`node <skill>/scripts/build-manual.mjs docs/manual`).

- **Input → output:** code + specs → audit report / `docs/manual/` (md + assets + html + pdf)
- **Review memory:** the audit aggregates `Recurring:` lines from `*-quality` /
  `*-audit` reports — a class recurring across reports becomes a ready-to-paste
  CODESTYLE.md anti-pattern proposal (after approval); a review report card (findings
  by class, re-verification counts, the confirmation rate) rides the same report.
- **Key rules:** the manual's audience is the user, not a developer (no paths or internal
  names); the manual describes only verified behavior (by spec or live); everything else is
  marked `[draft: unconfirmed]`; screenshots come only from the dev stand + synthetic data.
- **When:** "check spec consistency", "sync the specs", "what is undocumented",
  "assemble the user manual", "update the manual".

## trace-audit — the pipeline's own broken promises

**Why:** the pipeline's artifacts promise each other things — every must criterion names
its `Verify:`, every child appears in its parent's `children`, every implementation gets
a review, every finding gets closed or carried. Under deadline those promises are what
gets skipped, silently. The skill walks the artifact tree mechanically and reports every
broken promise: the pipeline auditing itself.

- **Input → output:** `docs/specs/` + `docs/plans/` → `docs/specs/YYYY-MM-DD-pipeline-trace.md`
- **The checks:** orphan criteria (must without a runnable `Verify:` — manual checks
  listed separately, they wait on a person, not on nothing); traceability desync
  (`parent`/`children` one-way or dead links, id/slug mismatches); implementation
  without a review (closed plan tasks, no `*-review` — the release-blocking class;
  mid-flight chains are "working as intended", not findings); findings that never
  closed (walked report by report, with their age; `Recurring:` classes across
  consecutive reports become a CODESTYLE proposal for tech-writer); stuck work
  (`- Blocked by:` tasks whose question the spec no longer lists); status honesty
  (a draft with closed implementation, an approved without an approval trail).
- **Routed, not fixed:** every finding names its owner — spec defects → amendments
  (analyst), missing reviews → qa, open findings → the plan or root-cause, recurring
  classes → tech-writer. The auditor edits nothing.
- **Key rules:** mechanical, not judgmental — a finding is a broken promise between
  artifacts, checkable by re-reading them ("this spec seems thin" is spec-review's
  judgment); a check with nothing to walk is "nothing to check", never "passed".
- **When:** "audit the pipeline", "pipeline health", "what's uncovered", "which specs
  never got reviewed", before a release.

## root-cause — bug → minimal fix

**Why:** treats the disease, not the symptom. The oracle is the expected behavior (the spec
or the user's words); the current code is the suspect, not the truth.

- **Flow:** triage — which of the four is this: product defect / wrong test (the
  expectation is wrong; the spec, not the test, is the oracle) / environment-data
  mismatch (not a bug — report what differs) / spec mismatch (the amendment protocol,
  not a code change); only the product defect walks on → reproduce (mandatory,
  otherwise it is not a fix but guessing) → isolate →
  the root cause in one sentence → a red test (it stays in the suite as a regression test;
  deleting it is forbidden) → a minimal fix → green test + full suite → report, naming
  the triage class first.
- **Key rule:** if the code does exactly what it was built for and something else is wanted —
  it is not a bug but a feature request → brainstorm. A risky fix (shared core, data,
  security) → spec-review in a fresh session. With an active plan, the fix becomes a plan
  task (spec-gate insists).
- **When:** "it doesn't work", "bug", "it crashes", "still broken after fixing".

## lazy — behavioral overlay

**Why:** the discipline of a lazy senior on top of any coding. The smallest complete change;
the reuse ladder (not needed → already in the codebase → standard library → installed
dependency → one line → minimal code); thinking once (two failures of the same approach —
switch approaches or ask); a 1–2 line report: what was skipped and what the risk is.

- **When:** any coding; phrases "keep it lazy", "simpler", "don't overcomplicate",
  "why so much", "be lazy", "yagni" — or complaints about overcomplication.
- **Never cuts:** validation at trust boundaries, error handling where data can be lost,
  security, accessibility, anything explicitly requested.

## kb-index — map of the documentation

**Why:** in a large corpus, the question "where is this described" costs a dozen reads.
The skill builds an index of document faces (id, title, gist, anchor) and a map for every
directory: the agent finds a document with one command and reads the needed section,
not the whole file.

- **Input → output:** documentation corpus → `.kbindex/index.json` (the contract
  `{ "schema": 1, "records": [...] }`) + `.kbindex/sections.json` (per-section term
  statistics, no texts) + `.kbindex/maps/<directory>/INDEX.md`; the index is not versioned
  and ignores itself in git.
- **How to search:** `kb.mjs search "<query>"` — two tiers: first by id, title, gist,
  anchor, and path, with an inflection fallback (`boxes` finds `boxed`); then by body —
  BM25 over sections, for words absent from the face (an identifier inside someone else's
  text, a term from the middle of a section). The output includes the anchor line
  `§<heading>:<line>` (for a body hit — the best section); read from there;
  `kb.mjs map <directory>` — the composition of a directory.
- **Graph:** `kb.mjs related <path|id>` — a document's neighbors (incoming/outgoing links
  and resolved `parent`/`depends_on`/… relations), `kb.mjs path <A> <B>` — the shortest
  chain of documents. Arguments resolve without guessing: an ambiguous `id` returns
  candidates.
- **Config:** `.kbindex.json` at the project root — `roots`, `include`, `exclude`,
  `gistMaxChars`, `bodySearch`. `exclude` sets privacy: paths enter the index without a body
  (no gist, no anchor, no links, no sections) — for example, client briefs.
- **When:** "where is X documented", "find the document about X", "what exists on X",
  "which documents relate to X", "refresh the index", "rebuild the map".
- **Key rule:** the index is a derivative; the source of truth is the files. No gist →
  add an intro paragraph to the document, not to the index; the plugin's gates (Stop in
  Claude Code and Codex, a settle-time follow-up in pi) do not let a turn finish with a
  stale index — in hosts without a gate, run `build` by hand after editing documentation.

## codestyle — repo conventions as a document

**Why:** the pipeline's executor works with fresh context — a task and a spec; it never
sees the repository, so it has nowhere to take conventions from. The skill extracts
**evidence-backed** conventions from the code and writes `CODESTYLE.md` to the repo root;
consumers (implementation-plan, spec-implementation, spec-review) reference it. The goal is
mimicry: agent code is indistinguishable from developer code.

- **Input → output:** repo code + git history → `CODESTYLE.md` (frontmatter
  `codestyle/generated/base` — a machine-readable freshness anchor).
- **Two modes:** generate — a full analysis (CLAUDE.md/AGENTS.md as normative → linter
  configs → git log → a sample of 15–25 files → rules with evidence → verification against
  a held-out sample); verify — a cheap cross-check against recent commits
  ("24 rules: 22 confirmed, 1 updated, 1 removed").
- **Agent readability (section 10):** the repo's other reader navigates by grep and reads
  in capped chunks — the section records the size/name/comment constraints the repo
  actually meets, measured by `node <skill>/scripts/codestyle.mjs scan` (files, largest,
  oversized, the 500-line threshold); a constraint the numbers break is named as an
  exception, never a rule to pretend.
- **Hard rules:** a rule without `file:line` evidence is not recorded; generate never reads
  the previous document (anti-echo-chamber); linter configs are the primary source, their
  aspects are not paraphrased; a 150-line cap.
- **Freshness:** the codestyle-reminder hook (SessionStart, never blocks) counts code
  commits since `base`; the verdict — `node <skill>/scripts/codestyle.mjs status`.
- **When:** "write down the conventions", "rebuild CODESTYLE", "check convention freshness",
  "codestyle" — or a hook reminder.
- **Key rule:** the document describes how code is *written here*, not how it *should be* —
  it is a derivative of the code; the source of truth is always the code.

## dispatch — which role takes this task

The framework's entry point, carried by every plugin (roles and the full bundle). One
decision comes before any work: which role owns the task — work inside the wrong role
produces the wrong artifacts.

- **Classify:** analyst (understanding, specifying, docs) / dev (making — implement, fix,
  refactor) / qa (proving — review, acceptance, hunting) / outside the framework (ops,
  git chores, chat — just do the work). Announce the verdict, load the role's `role-*`
  entry skill. The role is not installed — name the plugin to install or suggest a
  session with that role; unclear — one short question to the user, not a guess.
- **Switching:** mid-task the work may outgrow the role. Never drift. Ask the user:
  switch here (the behavior changes; on Claude Code/ZCode also update `.spec-gate` to
  `role: <name>`) / a new session with the role / a role subagent (where the host
  supports them) / stay and record the out-of-role part as an artifact for the other
  role. No answer means stay.
- **Enforcement:** on Claude Code and ZCode the skill-gate blocks out-of-role skill
  calls with a pointer here; on pi, Codex CLI, and OpenCode the skill is advisory —
  follow it honestly.

## role-analyst — enter the analyst role

The analyst's entry skill: mission (understanding, written down — specs a business person
can verify and a developer implements without guessing), the working cycle
(brainstorm → system-thinking → decompositor, kb-index to navigate, tech-writer after
merge), and the role's principles — no code and no implementation decisions, at most 10
questions before the spec, every criterion EARS-shaped with an explicit `Verify:`, the
blast radius named. Out of role: writing/fixing code, verdicts, bug hunting — use the
dispatch switching protocol. On hosts with the skill-gate, activation offers to pin
`role: analyst` in `.spec-gate`.

## role-dev — enter the developer role

The developer's entry skill: mission (working code that does exactly what the spec says,
proven by tests that fail without it), the working cycle (implementation-plan →
spec-implementation; `lazy` always on; `codestyle` first in an unfamiliar repo;
`root-cause` for bugs), and the principles — spec > test > code, tests first, vertical
slices, one task = one commit, the smallest change that fully satisfies the spec, a bug
fixed once at the cause behind a red-then-green test, quality guards are load-bearing
(never remove or weaken a test/hook/lint gate to make work pass — that is a change
needing explicit justification). The handoff to qa carries the
touched-surface map (what the change reaches beyond the diff, where regression risk
sits). The self-review pass is part of
the work; the acceptance verdict is qa's. Out of role: specs, verdicts, reviews — the
dispatch protocol. Activation offers `role: dev` in `.spec-gate`.

## role-qa — enter the QA role

The reviewer's entry skill: mission (a verdict the reader trusts without re-running the
work — every claim with evidence), the working cycle (spec-review criterion by
criterion; stand-acceptance for the locally unverifiable; code-review / bug-hunt on
demand; best in a fresh session), and the principles — a verdict without evidence is an
opinion; passed / failed / unverifiable-with-reason, never "mostly passes"; review from
artifacts, never from the authoring session's transcript (subagents get the artifacts,
not the conversation); adversarial
by default; critical findings reported immediately; the reviewer does not fix — and
does not design the fix either (a direction is a hint, not an imposed solution) — findings
and failed criteria are handoff artifacts for dev (`root-cause`) and the analyst
(amendments). Activation offers `role: qa` in `.spec-gate`.

## Fast lane — SDD for small tasks

**Why:** the full pipeline pays off on a feature; on a spot fix it is friction, and the
team starts silently bypassing it. Fast lane fixes the short path as a mode with
invariants: SDD documentation even for a small task, but one artifact instead of four.

- **Entry criteria (objective):** one repo, ≤5 files, 1–3 acceptance criteria, no
  cross-repo contracts, migrations, or rollout order. Any "no" or doubt — the full pipeline.
- **Flow:** a mini-spec (what and why + 1–3 verifiable criteria, sourced from the request)
  in the header of a one-task plan `docs/plans/YYYY-MM-DD-<topic>-quick.md` →
  spec-implementation: one task, tests-first, one commit, `- Done:` → spec-review deferred
  and batched (before merge or weekly; unverifiable → stand-acceptance as usual).
- **Invariants (never cut):** tests-first for behavior changes, closure with `- Done:`,
  the deviation protocol (ruling / amendment / intent), a 1–2 line report, evidence in
  review.
- **Forbidden in fast lane:** cross-repo work, contract behavior, security-sensitive code,
  destructive operations, data migrations. **Two-strike rule:** an edit required an
  amendment or touched a contract — the next change in that area goes through the full
  pipeline.
- **The `fast` profile (`.spec-gate`):** fast lane is the project default; brainstorm /
  system-thinking / decompositor — only on the user's explicit request: plan-context reports
  the profile at session start, skill-gate in Claude Code blocks autonomous runs
  (in pi — orientation only, no blocking). The profile changes the default, not the
  permission.
- **When:** "do it quickly", "a small fix" — or the project profile.
