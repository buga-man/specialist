# Skills: what each of the twenty-six does

A pipeline for the full feature development cycle — from a raw task to code backed by a
spec and up-to-date documentation. Each skill is a separate role with a clear input and
output; the output of the previous stage is the contractual input of the next. Decisions
are made at the top (in the specs) and recorded; at the bottom they are only executed.

Two invocation tiers hold the composition: **entry skills** (dispatch, the role entries,
bootstrap, retro) orient the session and orchestrate — they are reached for at the start
of work or asked for directly; **pipeline skills** carry the discipline each stage
executes. An entry skill hands work to pipeline skills; a pipeline skill never routes
the session to another entry — switching roles or re-orienting is dispatch's one
decision to make.

```
task → brainstorm → business spec
      business spec → system-thinking → system spec (repos, contracts, rollout)
            system spec → decompositor → repo spec
                  repo spec → implementation-plan → a task plan for an agent
                        plan → change-impact → blast radius before the edit · diff vs promised scope after
                        plan → spec-implementation → code (tests-first, the spec is the oracle)
                              code → spec-review → acceptance (criterion by criterion)
                                    unverifiable → stand-acceptance (live acceptance on the stand)
                                    deeper pass on demand → code-review (quality & logic) / bug-hunt (bugs & security)

the spec side of QA (shift left):
      spec → test-analysis → gaps report (holes, missed criteria, corner-case axes) → amendments
      accepted criteria → test-design → cases artifact (TEST-IDs, grader-typed, executable)
      the defect queue → defect-triage → verified, classified, routed rows

after merge / before release → tech-writer → spec audit + user manual

bugs → root-cause → reproduction → root cause → red test → minimal fix

documentation map → kb-index → index + maps (search by the document's "face")

repo conventions → codestyle → CODESTYLE.md (mimicry: agent code is indistinguishable from developer code)
```

`lazy` is not a stage but a behavioral overlay for any coding.

## Roles: how the skills ship

The same pipeline installs as one full plugin or as three skills-only role plugins —
install a role and the session carries only that role's skills. `dispatch`, `scouts`,
`bootstrap`, and `retro` ride in every plugin — the router classifies a task by role
before any work starts, the protocol governs every fan-out, the primer sets a repository
up, the retro improves the environment after real work; `role-analyst` / `role-dev` /
`role-qa` are the roles' entry skills. Roles are switched only with the user's explicit
consent — the options live in `dispatch`.

| Plugin | The role | Skills |
|---|---|---|
| `specialist-analyst` | a raw task to specs and true documentation | brainstorm, system-thinking, decompositor, kb-index, tech-writer, trace-audit, `role-analyst` |
| `specialist-dev` | a repo spec to spec-driven code | implementation-plan, change-impact, spec-implementation, codestyle, lazy, root-cause, `role-dev` |
| `specialist-qa` | acceptance, review, bug hunting | test-analysis, test-design, spec-review, stand-acceptance, code-review, bug-hunt, defect-triage, `role-qa` |
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
- **Scouts by explicit permission.** Skills whose stages split into independent
  read-only missions — the recon trio (brainstorm, system-thinking, decompositor),
  bug-hunt's parallel hunters, and the wide-pass consumers (spec-review, code-review,
  test-analysis, defect-triage, trace-audit) — parallelize through the `scouts`
  skill: one question asks permission and the count (`.spec-gate`'s `scouts: <N>`
  pin can answer it standing), the granted count is the hard budget, and no answer
  or no host support means the same missions run sequentially. Scouts read — never
  edit; their reports are hypotheses until re-verified in the main context.
- **Slug navigation.** All artifacts of a feature carry its slug: `docs/specs/YYYY-MM-DD-<topic>*`
  (business spec, `-implementation`, `-<repo>`, `-<repo>-review`; review reports —
  `-<repo>-quality`, `-<repo>-audit`) and `docs/plans/YYYY-MM-DD-<topic>-<repo>.md`. The
  whole chain is one glob: `ls docs/specs/*<topic>* docs/plans/*<topic>*`.
- Content is written in the team's working language; the skills themselves are in English.

---

## brainstorm — raw task → business spec

**Why:** tasks arrive as three lines hiding half the requirements. The skill surfaces them:
it studies the docs and the system, asks the user at most 10 questions per round (two
rounds at most, only those whose answers change the spec, ordered by what they move —
scope > security/privacy > UX > technical detail; below that line an assumption is
proposed instead of a question), and turns it all into a business spec.

- **Input → output:** raw task → `docs/specs/YYYY-MM-DD-<topic>.md`
- **In the spec:** business meaning without code (no paths, APIs, schemas), scope/non-scope
  and constraints, must/should acceptance criteria (each with a source `[request]/[docs]/[answer #N]`,
  an EARS shape per references/ears-patterns.md with the quality bar (fail test, discriminating
  power, measurable vocabulary, defined terms; a worked sharpening example included) and — for
  must — a `Verify:` command or an explicit manual check plus a `Must-not:` boundary
  (nothing else changes); the mechanical part of the bar is a
  runnable self-check (`node <skill-dir>/scripts/check-criteria.mjs <spec>` — Verify and
  Must-not presence, vague wording, the 5–20 must band, more than three blocking open
  questions). Business
  cases "actor → action → outcome" (each covered by at least one criterion) carry a
  priority tier P1/P2/P3 — the P1 tier alone is a shippable slice and the plan's
  slicing order — plus a glossary slot for the terms the criteria rely on, success
  metrics, open questions with working assumptions and a blocking flag (more than
  three blocking rows means the picture is not one yet — the script says so). **Value-first,
  above the formal bar** — problem, not solution (strip every mention of implementation;
  the need must still stand on its own) and no gold-plating (every criterion traces to
  the stated value; a criterion beyond the need is a finding, not a bonus). Amendments
  to an approved spec are classified by impact — wording / touches a criterion (the
  user re-confirms) / contradicts a recorded decision (a conflict, raised) — and the
  spec freezes while an external reviewer holds it: changes land after the verdict,
  so the text under review stays the text that was reviewed.
- **When:** any new task/feature; phrases "gather requirements", "make a spec".
- **Not for:** bugs — those belong to root-cause.

## system-thinking — business spec → system spec

**Why:** the main value is finding work the spec is silent about: a frontend for a
"backend task", migrations, compatibility, permissions — and work the spec duplicates:
what was ordered as "new" may already exist in a neighboring repo. Reconnaissance of all
affected repositories, blast radius, contracts between repos (each complete — fields,
an example pair, an error table, limits or an explicit "no limits"; a change to an
existing contract is classified breaking/additive, breaking carries a migration plan;
each with its owning contract test), data migration and rollback, rollout order. Repo
recon fans out through the `scouts` skill — one scout per repo under the shared
grant-and-charter protocol (sanitized prompts, artifacts never conversations).

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
UI changes carry an elements table (element | type | visible when | label | behavior) —
the verifiable shape of UI requirements, walked element by element in spec-review.
- **When:** "split by repository", "decomposition", "what changes in this repo".

## implementation-plan — repo spec → a task plan for an agent

**Why:** the plan is written for an executor with fresh context: task + repo spec = all it
needs. Written plans survive session boundaries and compaction — plans in a head do not.

- **Input → output:** repo spec → `docs/plans/YYYY-MM-DD-<topic>-<repo>.md`
- **Task format (machine-readable, parsed by spec-gate):** `### Task N`, `- Files:`
  (paths in backticks, globs allowed; a long list may wrap — the continuation lines
  are the same scope line), action steps, `Verify` with the exact
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

## change-impact — blast radius before the edit · diff vs promised scope after

**Why:** a nontrivial edit hits more than its files — data, contracts, tests that start
lying, docs, rollout. The skill measures the blast radius before the change begins and
aligns the actual diff with the promised scope after it. Assessment only — it changes no
code.

- **Input → output:** a planned change → a written before-list; the actual diff → an
  alignment report
- **Before — six questions, in order:** code (modules really touched — proven by imports
  and call sites, not directory names) · data (formats, schemas, migrations, old-data
  compatibility) · interfaces (contracts outward and inward — API, events, CLI, exports —
  and who else reads them) · tests (which cover the touched paths; which will lie after) ·
  docs (which documents describe the changed behavior) · release (rollout, rollback, the
  transition window). Every answer lands in the before-list; an untouched area gets an
  explicit "not touched", not silence.
- **After — alignment:** the diff reread hunk by hunk against the promised scope (a plan
  task's `- Files:` line when a plan is open; otherwise the scope stated in the request) —
  outside it, justify explicitly or revert; every before-item closed or marked
  "not needed" — a silently dropped item is a finding.
- **Key rule:** the skill edits nothing — the edit is spec-implementation / root-cause
  work; cross-repo blast radius is system-thinking's, code quality is code-review's.
- **When:** "what will this change touch", "what's the blast radius", before or after a
  nontrivial edit.

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

## test-analysis — spec → gaps report

**Why:** the spec is a product, and it ships with defects — unnamed cases, missed
criteria, vague wording. A hole found in text costs minutes; the same hole in code
costs days. The spec-side twin of `bug-hunt`: it assumes the spec is incomplete, not
the code broken (there is no code yet).

- **Input → output:** the spec chain (business primary, system/repo as context) →
  `docs/qa/YYYY-MM-DD-<topic>-gaps.md` — holes (the unnamed case, as a question),
  missed criteria (ready to paste: EARS shape, must/should, a grader-typed `Verify:`),
  contradictions (both sides quoted), vague wording (the proposed decision table
  attached).
- **The mechanical probe:** `node "<skill-dir>/scripts/probe.mjs" <spec.md>` — must
  criteria without a `Verify:`, duplicated criterion texts, unmeasurable wording (the
  bilingual vague list), the must-count band, and three hole signals: no error-path
  criterion, no boundary criterion, dual-mode keywords with no both-modes criterion.
- **Criteria mining:** contract error rows, UI element table cells, data invariants,
  NFRs hiding in prose (four fields: criterion + method + threshold + environment),
  business cases' failure continuations, the area's prior defects — each a criterion
  waiting to be written; the deliverable is the diff against what the spec has.
- **Corner-case axes, enumerated not recalled:** boundaries per data element, state
  transitions, dual modes (sandbox/prod, flag on/off — the shared-blind-spot axis),
  permissions (actor × action), concurrency.
- **Scouts:** a wide spec fans the mining sources and the axes out read-only through
  the `scouts` skill — the mined diff, its dedupe, and the gaps report stay central;
  the probe script never fans out.
- **Grader types on every proposal:** `command` (default) / `stand` / `manual` /
  `model` (a marked last resort — a model grader never proves, it opines).
- **Key rule:** a hole is a question, not an invention — findings travel to the owning
  spec as amendments the user approves; this skill never edits a spec silently.
- **When:** "probe the requirements", "find spec gaps", "check the criteria for
  completeness", before implementation planning on a nontrivial feature.

## test-design — criteria → the cases artifact

**Why:** criteria say what must hold; cases say how each is exercised. One artifact
with stable TEST-IDs makes coverage checkable in both directions — a criterion no case
exercises and a case exercising nothing the spec asked for are both visible findings.

- **Input → output:** accepted criteria + business cases + contract/element tables +
  the gaps report → `docs/tests/YYYY-MM-DD-<topic>-<repo>-cases.md` — a cases table
  (`ID | Criterion | Type | Grader | State / input | Expected`), decision and state
  tables for formalization, a regression section sourced from prior defects.
- **IDs are stable and append-only:** never renumbered, retired rows are never reused,
  new rows join the end of the table — every downstream reference (reviews, plans, the
  suite) hangs off them; an ID inserted between existing rows means the table was
  rewritten, and the script flags it.
- **Type:** main / alternate / exception / boundary / dual-mode / permission /
  concurrency / state / regression. **Grader:** command (the default — the same model
  writing and reviewing shares one blind spot, so what can be a command never ships as
  a model judgment) / stand / manual / model.
- **The contract script:** `node "<skill-dir>/scripts/cases.mjs" check <cases.md>
  <spec.md>` — malformed/duplicate IDs, out-of-order IDs (the table is append-only),
  unknown graders and types, missing cells, unknown criterion references, and the
  coverage both ways (a must criterion without a case is an error; a should without
  one is a note).
- **One artifact, three consumers:** spec-review walks it TEST-ID by TEST-ID;
  spec-implementation mines command-graded rows as red tests; stand-acceptance runs
  the stand-graded rows. root-cause's regression tests join the same registry.
- **Key rule:** the artifact never invents criteria — a case exercising behavior no
  criterion names goes back to test-analysis as a missed-criterion finding.
- **When:** "design test cases", "write the test suite from the spec", "prepare
  acceptance material", after new criteria were accepted.

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
- **Gap classes:** every failed criterion and deviation carries one — `missing` (absent
  from the code) / `partial` (short of the criterion's words) / `contradicts` (the
  opposite, or against a recorded decision) / `unrequested` (no spec asked for it) —
  the axis the fix routes by: missing and partial return to the plan, contradicts is
  the user's ruling, unrequested is justified or removed.
- **Plus:** a scan for unsanctioned behavior (what the code does beyond the specs), an audit
  of the executor's report, spec-drift (a divergence without an amendment = failed; a stale
  spec — propose an amendment), terminology drift (the glossary is the canon — one
  concept, one name; a downstream artifact renaming a defined term is a documentation
  finding), CODESTYLE Principles enforcement (a violated MUST principle is changes
  required on that alone), and the criteria attack: name a plausible wrong implementation
  that would pass every criterion — if one exists, the criteria set gets a proposed sharper
  criterion (amendment), so the trap does not survive into the next feature. Proposed
  amendments carry an explicit status — proposed → accepted/rejected with the date; a
  `proposed` surviving into the next review is carried forward with its age; an
  amendment changing an existing contract carries its blast-radius class — breaking
  (a migration note is part of the amendment) / additive. Outcome: accepted /
  accepted with notes / changes required; **the review loop converges or says so** —
  a re-review pass with zero failed criteria and zero actionable deviations is
  terminal (`Converged: pass N`), with nothing written to look busy.
- **Cycle line:** the report opens with `Cycle: plan date → accepted date (N days)` —
  derived from the slug dates; no state stored (tech-writer's audit aggregates these
  into a cycle-times table).
- **Scouts:** a wide spec's criterion walk (and the cases spine, TEST-ID by TEST-ID)
  fans out read-only through the `scouts` skill — the verdict table, the amendment
  lifecycle, and the criteria attack stay central.
- **Key rule:** the reviewer does not fix — fixes go back into the plan for the executor;
  bugs go to root-cause.
- **When:** "review the implementation", "accept against the spec", "run acceptance".

## code-review — diff → quality & logic report

**Why:** spec-review proves the code does what the spec ordered; nobody yet asked how
well it is written. The skill reviews readability and the cost of the logic: could a new
developer maintain this code a month from now, and does it do its work without needless
effort.

- **Input → output:** diff (branch against base) + the code around each hunk +
  `CODESTYLE.md` where present + the spec chain's recorded decisions ("Decisions and
  rationale") where the feature has them → `docs/specs/YYYY-MM-DD-<topic>-<repo>-quality.md`
- **Change map:** the report opens with the diff as three groups — **heart** /
  **consequences** / **glue**, one sentence on why the heart is the heart, not a
  file-by-file retelling — and closes it with the coverage line
  `Not reviewed: N — <files>` (`Not reviewed: none` when empty): every changed file
  is in the map, in the findings, or named as not reviewed; a reviewer quietly
  skipping files is the report's blind spot.
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
  severity blocker / worth fixing / note; only live code carries production weight —
  a finding names its source kind (live / fixture / example / dead), and
  production-grade demands on an example or doc snippet are a known false positive;
  a findings table caps at 50 rows, the rest
  collapse into one overflow line; outcome clean / worth a pass / rework required.
  Blockers and worth-fixing go back into the plan as tasks. A violated MUST
  principle of CODESTYLE.md's Principles section is a blocker on that alone.
- **Re-verification and memory:** a previous `*-quality` report opens the pass —
  carried findings get closed / not closed / fixed-with-regression statuses
  (`Re-verified: N closed, M not closed, K regressions`); **the loop converges or
  says so** — a re-review with zero blockers and zero worth-fixing findings is
  terminal (`Converged: pass N`), no filler to look busy; findings live in a countable
  table and the report ends with a `Recurring:` line — the review memory tech-writer
  aggregates into CODESTYLE anti-patterns.
- **Scouts:** a large diff's churn-ordered deep reads and the re-verification of
  carried findings fan out read-only through the `scouts` skill — the duplication
  grep and the findings table stay central.
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
  through which entries), a session charter (mission / scope boundary / time-box
  25–45–90 minutes — when the box ends, the report is written with what is in hand),
  and the installed analyzers (semgrep, linters) as verifiable
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
  the table caps at 50 rows, the rest collapse into one overflow line;
  **no scenario — no finding**; **a finding names its source kind** (live code /
  fixture / example in docs / demo / dead code — a structural finding in a non-live
  source is a note at most; substance outranks the source — a real-format secret in
  an example is still a finding, downgraded one step); **dedup on filing** — the same trigger scenario
  already open in a prior audit links and carries its status, never a duplicate row.
  Critical security findings are reported to the user
  immediately; the report never carries live secret values. Outcome: no findings /
  findings listed / exploitable — fix before merge; **the hunt loop converges or
  says so** — a re-hunt with no findings is terminal (`Converged: hunt N`) within
  the agreed budget. A two-line debrief closes the
  report — what the charter got right or wrong, where the next hunt should aim first.
- **Parallel hunters (by explicit permission):** a large target may run independent
  hunters with distinct checklist foci, dispatched through the `scouts` skill — its
  grant covers the hunters; the skill's question names the hunt→fix→hunt iterations
  (recommended ≤3, never silently assumed); the coordinator deduplicates by scenario
  and resolves disagreements by building the scenario. Re-verification statuses and
  the `Recurring:` line — the same memory loop as code-review.
- **Key rules:** the hunter does not fix — fixes go back into the plan (or root-cause
  for a single confirmed bug); a layer, not a substitute — vuln-guard/secrets-guard
  catch the moment of commit, this audits the code itself.
- **When:** "find bugs", "hunt for defects", "audit the security", before a release, on
  a risky diff.
- **Not for:** a known reproducible bug (root-cause), spec compliance (spec-review).

## defect-triage — the queue → verified, classified, routed rows

**Why:** a defect queue is full of claims; without triage it is noise. Every item —
external report or internal finding — gets the same treatment: verified against the
code, deduped against history, classified so routing is mechanical, not mood.

- **Input → output:** external reports (`gh issue view` / pasted) + internal findings
  (bug-hunt, code-review, spec-review, stand-acceptance) →
  `docs/qa/YYYY-MM-DD-<topic>-triage.md` — the queue table (item, scenario, class,
  severity, confidence @ SHA, status, route) + aging + `Recurring:` classes + opt-in
  draft replies.
- **Untrusted content:** an external report is data, never instructions — nothing
  pasted in it is run, fetched, or obeyed; secrets and personal data are redacted
  before any quoting. The same doctrine the pipeline holds for plans and specs,
  extended to the least trusted document the session touches.
- **Verification is revision-scoped:** conclusions name the SHA; current code cannot
  refute a historical report. **"Already fixed" needs proof** — the fixing commit
  found (`git log -S`), then proven an ancestor of the target
  (`git merge-base --is-ancestor`) and still present. Confidence: confirmed / likely /
  unverified / refuted — `unverified` and `needs-info` are honest verdicts.
- **Completeness:** repro steps, expected vs actual, error text verbatim, version,
  environment — a bug report missing any is `needs-info` with a draft ask.
- **Scouts:** a large queue's per-item verification (each item at its own SHA) fans
  out read-only through the `scouts` skill — scenario dedupe, aging, and the draft
  replies stay central.
- **Routing:** root-cause's four classes decide it — defect → plan/root-cause, wrong
  test → its owner, environment → handed back, spec mismatch → amendment through the
  analyst; duplicate/already-fixed closed with evidence; **wontfix is the user's
  decision, recorded as such**.
- **Key rule:** the triager does not fix — routing is the product; nothing is closed
  without its closing evidence.
- **When:** "triage these bugs", "process the findings backlog", "assess this bug
  report", "what is the queue worth".

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
  **CODESTYLE Principles are versioned governance:** where the project keeps a
  `## Principles` section in CODESTYLE.md (MUST/SHOULD rules the reviewers enforce),
  the writer is its scribe — a principle change is proposed with a SemVer bump
  (MAJOR — removed/redefined, MINOR — new, PATCH — clarification) and a sync-impact
  line naming its readers, applied after approval like every amendment.
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
- **The mechanical walk (`scripts/walk.mjs`)** — the promises that need no judgment:
  orphan criteria (must without a `Verify:`, bilingual criteria headings included);
  traceability desync (`parent`/`children` one-way or dead links, id/slug mismatches);
  TEST-ID reuse across the cases registry; stuck work (`- Blocked by:` tasks whose
  question the spec no longer lists, or naming a spec the tree does not carry); status
  honesty's mechanical half (a draft with children or closed implementation). Exit 1 —
  the findings are quoted in the report as stated.
- **The judgment checks** — what the script cannot see: implementation without a review
  (closed plan tasks, no `*-review` — the release-blocking class; mid-flight chains are
  "working as intended", not findings); findings that never closed (walked report by
  report, with their age; `Recurring:` classes across consecutive reports become a
  CODESTYLE proposal for tech-writer); the untriaged queue; approval honesty (an
  approved spec without an approval trail).
- **Scouts:** a wide tree's per-chain judgment walks fan out read-only through the
  `scouts` skill; the mechanical walk never fans out — walk.mjs is already tree-wide
  and fast.
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
  `§<heading>:<line>` (for a body hit — the best section); a body hit also shows its
  **answering line** — the snippet of the best section around the query word, so many
  questions are answered without opening the file at all. The first five hits carry the
  full face, the tail is paths only; a typo in an identifier (`REQ-081` for `REQ-018`)
  gets a `did you mean:` line with the identifiers within small edit distance.
  `--status` / `--type` / `--service` / `--updated-since <date>` narrow the corpus before
  the search; a word with a leading `-` must not appear (`gate -install`); a frontmatter
  `aliases` list is searched with the weight of the gist — manual synonyms for when the
  words of the task differ from the words of the document; `--json` turns search, map,
  path, related and audit into machine output for other hooks;
  `kb.mjs map <directory>` — the composition of a directory.
- **Graph:** `kb.mjs related <path|id>` — a document's neighbors (incoming/outgoing links
  and resolved `parent`/`depends_on`/… relations) with the gist of each neighbor — the
  follow-up decision comes without opening them; `kb.mjs path <A> <B>` — the shortest
  chain of documents. Arguments resolve without guessing: an ambiguous `id` returns
  candidates.
- **Health:** `kb.mjs status` — the index-vs-disk divergence on demand (what the Stop
  gate would block on, without blocking); `kb.mjs audit` — the quality report: duplicate
  `id`s, ambiguous relations, broken links, orphan documents, dependency cycles,
  hub documents, stale drafts, content drift; `--json` for machine consumers.
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

## scouts — subagents under an explicit grant

The framework's subagent protocol, carried by every plugin. Parallel read-only recon
and verification by scout subagents — under a grant the user names: one question asks
permission and the count, and `.spec-gate`'s `scouts: <N>` pin can answer it standing.

- **The grant:** asked once at the first fan-out of a session, it covers every skill
  in it; no answer, a "no", or a host without subagents → the same missions run
  sequentially under the same report contract. The count is the hard budget for
  simultaneous scouts; iteration loops run fresh scouts every round — inherited
  arguments anchor the new eyes.
- **The charter:** one mission per scout with a scope boundary (never "look at the
  repo"), distinct missions by assignment — parallel scouts do not
  self-differentiate. Prompts carry artifact paths, not contents; never pre-judge a
  scout — the mission says what to look for, not what to conclude.
- **The fan-in:** scout reports are hypotheses until re-verified in the main
  context; dedup by scenario, disagreements built out — never voted; a silent scout
  is chased, not assumed empty; critical findings surface immediately.
- **The boundaries:** scouts read — never edit; no recursion (a scout never
  dispatches scouts); one task at a time stays one task at a time, one charter per
  session stays one charter, and already-verified work is never re-verified for
  parallelism's sake.
- **When:** a skill's stage says "dispatch the scouts skill"; the user asks to
  parallelize research.

## bootstrap — set a repository up for the framework

**Why:** the framework reads config files and writes to known directories; a fresh
repository has none of them. The skill surveys what exists, proposes the gap list,
creates the confirmed pieces — and migrates legacy documentation under one rule:
port the content, never rewrite its meaning.

- **Input → output:** a repository → `.spec-gate`, `docs/specs/` + `docs/plans/`,
  `CODESTYLE.md` (via codestyle), optionally `.suite-gate` and `.kbindex/`.
- **Idempotent and confirmed:** a second run creates nothing; every piece is proposed
  with a one-line why and created only after the user confirms; existing files are
  echoed, never overwritten; no commits — files land in the working tree.
- **Migration rule:** the source is primary until the migration is accepted — content
  moves verbatim (no rephrasing, no invented gaps filled), missing sections become
  `Requires filling in`, one pilot document is reviewed by the user before the batch
  runs. Metadata (id/parent/children) is scaffolding added around the ported content.
- **When:** "set up specialist here", "initialize this repo for the framework",
  onboarding a repository; ends by pointing at `dispatch` for the first real task.

## retro — the environment, not the code

**Why:** the same friction twice is an environment defect, not an agent defect — the
check that would have caught it either does not exist or sits unwired. A retrospective
over real work turns the friction into mechanisms that execute, so the mistake cannot
happen the same way again.

- **Input → output:** a session, a feature run, or a release → a proposal table
  (friction | class | mechanism | what it would have caught) → the user picks → wiring
  lands where it executes + a `docs/specs/YYYY-MM-DD-<topic>-retro.md` report with
  `file:line` on every wired line.
- **Mechanical vs judgement:** a deterministic shape gets a deterministic check —
  build-first, a check the repo runs beats a rule the agent must remember; friction
  needing taste gets a documented convention (CODESTYLE via codestyle). The first
  question before building: does the framework already carry it?
- **The candidates that come first:** unwired checks (present but not connected — a
  linter outside edit-guard, a commented-out `.suite-gate`) and no-ops (instructions
  that change nothing versus the default — settled by comparing behavior, not wording).
- **Boundaries:** the retro proposes and records; the user wires. Relaxing a guard or a
  linter config is outside it (config-guard's block is correct); product code is
  root-cause's.
- **When:** work ends and the user asks what to improve, the same friction costs a
  second session, or a `Recurring:` class returns across reports. Shared: ships in
  every plugin; the next retro re-raises last time's unwired proposals first.

## role-analyst — enter the analyst role

The analyst's entry skill: mission (understanding, written down — specs a business person
can verify and a developer implements without guessing), the working cycle
(brainstorm → system-thinking → decompositor, kb-index to navigate, tech-writer after
merge), and the role's principles — no code and no implementation decisions, at most 10
  questions before the spec, every criterion EARS-shaped with its `Verify:` and
  `Must-not:`, the
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
