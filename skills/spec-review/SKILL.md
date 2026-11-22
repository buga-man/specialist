---
name: spec-review
description: Review an implementation against its specs — criterion by criterion, with verdicts and evidence. Use when work done via the spec pipeline needs acceptance (a branch or diff is ready) and the user asks to review, check, or accept the implementation. Reads the specs, the plan, the diff, and the executor's report; produces per-criterion verdicts passed / failed / unverifiable plus a deviations list. Runs best in a fresh session — the author of the code should not be its reviewer.
---

# Spec review

Check an implementation against its specs. The specs are the oracle — the same hierarchy
as in implementation: **spec > test > code**. The reviewer's value is independence: the
executor already believes the code is right; this skill assumes nothing is right until
evidence says so.

Run in a fresh session when possible — reviewing your own implementation is the weakest
review there is.

## Flow

```
1 gather context → 2 verify criterion by criterion → 3 scan for unrequested behavior
→ 4 audit the executor's report → 5 verdict & report
```

## 1. Gather the context

- All specs (business, system, repo), the implementation plan, the diff (branch against
  base, or the commits), test results, and the executor's final report.
- A missing artifact → stop and ask for it. Reviewing without the repo spec means
  guessing the criteria.
- Traceability metadata, end-to-end: every artifact's `parent` appears in that parent's
  `children`, and every `children` entry resolves to an existing file. A desync is a
  finding (documentation defect) — reported, never silently fixed here.

## 2. Verify criterion by criterion

- Walk the acceptance criteria of the business spec and the changes of the system and
  repo specs. For each: examine the tests that claim to cover it, then the code, then
  the running behavior where reachable.
- A criterion carrying `Verify:` is checked by running exactly that command (or performing
  the named manual observation) — the verdict cites the run, not an impression. A must
  criterion without a runnable `Verify:` is unverifiable by default; flag it as a spec
  defect (proposed amendment), not a code failure.
- A cases artifact for the feature (`docs/tests/*-cases.md`, the `test-design` skill)
  is the verification walk's spine: run it TEST-ID by TEST-ID, each case producing its
  own evidence-backed result, and the per-criterion table cites the cases that decided
  it. A criterion with cases but no case result is a gap in this review, not in the
  artifact.
- Verdict per item:
  - **passed** — with evidence: a test, a code location, or an observed behavior;
  - **failed** — what differs from the spec and where;
  - **unverifiable** — cannot be checked from here; name exactly what is needed
    (a live environment, a manual step, a missing test).
- A criterion with no test and no observable behavior is unverifiable, never passed.
- Every failed criterion and every deviation carries a **gap class** — `missing` /
  `partial` / `contradicts` / `unrequested`: *missing* — the required behavior is
  absent from the code; *partial* — present, but short of what the criterion's words
  demand; *contradicts* — the code does the opposite, or conflicts a recorded
  decision; *unrequested* — behavior no spec asked for (§3). The class is the axis
  the fix routes by: missing and partial go back into the plan as tasks, contradicts
  is a deviation the user must rule on, unrequested is justified or removed — and
  a verdict without its gap class is an impression, not a verdict.
- **A green run is not evidence by itself — a pass ≠ a verified criterion.** The
  evidence is the *match* between the test's assertions and the criterion: cite the
  assertion against the criterion's words. A suite green because the covering test
  asserts less than the criterion demands (checks the status code, not the payload the
  criterion names; checks the happy path, not the error contract) is a passed run over
  an uncovered criterion — verdict unverifiable, and the gap becomes a proposed
  amendment sharpening the test, not a quiet pass. The expectation side gets the same
  scrutiny (test-design's rule): an expected value recomputed by the same algorithm the
  code runs agrees by construction — such a pass verifies nothing.
- **Non-functional criteria must be measurable to be verifiable**: performance,
  availability, capacity, resilience criteria carry **criterion + measurement method +
  threshold + environment** (e.g. "p95 response ≤ 500 ms — k6 load test, 100 concurrent
  users, staging"). Missing any of the four → unverifiable, and the amendment proposes
  the four fields — "fast" and "reliable" are wishes, not criteria.
- **Attack the criteria.** After the walk, try to name a plausible wrong implementation
  that would pass every criterion — the shape-checks trap from shallow oracles. If one
  exists, the implementation may still be accepted, but the criteria set is weaker than
  it looks: report the gap with a proposed sharper criterion (amendment) — shaped per
  references/ears-patterns.md (EARS stems + the quality bar) — so the next
  feature inherits teeth instead of the trap.

### Scouts — parallel criterion walks (a wide spec)

Every criterion yields its own evidence-backed verdict, and the cases spine runs
TEST-ID by TEST-ID — independent rows. A wide spec (many criteria, a long cases
artifact) may fan the walk out read-only through the `scouts` skill: one scout
per criterion group or per cases section, each producing verdict rows with
their evidence. The grant, the mission charter, and the fan-in rules live in
`scouts`. What stays central regardless: the verdict table, the amendment
lifecycle (the user approves — never a scout), questions for the user, and the
"attack the criteria" pass (it judges the set, not the rows). Without a grant
the same walk runs sequentially — the verdicts' contract does not change.

## 3. Scan for unrequested behavior

- Read the diff for what it does **beyond** the specs: extra behavior, changed behavior
  nobody asked for, sneak-in refactors, dead code, dependency changes, widened security
  surface (permissions, data exposure).
- Read the tests for what they fail to do: tautological tests that pass but check nothing,
  and gaps the executor's "close the gaps" step should have caught — error paths,
  boundary values, null and empty cases.
- Where the repo carries `CODESTYLE.md`, scan the diff against it: code visibly departing
  from the documented conventions (naming, idioms, structure) is a finding — a note,
  never a failed criterion on its own. A `## Principles` section there, where the
  project keeps one, outranks style: a diff violating a MUST principle is
  **changes required** on that alone — the deviation names the principle and carries
  the gap class `contradicts`; a violated SHOULD principle is a normal finding.
- **Terminology drift**: the business spec's glossary is the canon — one concept,
  one name. A downstream artifact (plan, cases artifact, tests) renaming a defined
  term, or the spec itself carrying two names for one concept, is a documentation
  finding: propose the amendment that restores the one name, never adopt the drift.
- Grep the diff's new symbols against the repo: code duplicating existing functionality is
  a finding even when the spec ordered it — the spec's `searched:` failed; propose the
  amendment (extend the existing piece instead), never pass it silently.

## 4. Audit the executor's report

- **Decisions the specs did not cover**: consistent with the specs' intent? Which need
  explicit user sign-off?
- **Ambiguous readings**: does the implemented reading match what the user actually
  meant? This is where the user is genuinely needed.
- **Rulings and deviations from the plan**: reasonable, or should be reverted?
- **Spec drift**: a divergence between code and specs with no amendment behind it is a
  failed criterion — flag it. And the reverse: where the code proved the spec outdated,
  propose an amendment (the reviewer proposes, the user approves — never applies silently).

## 5. Verdict & report

- Persist the report as `docs/specs/YYYY-MM-DD-<topic>-<repo>-review.md`, next to the
  spec it reviews — verdicts, proposed amendments, and open items must stay navigable,
  not live in chat.
- The report opens with a cycle line: `Cycle: plan YYYY-MM-DD → accepted YYYY-MM-DD
  (N days)` — derived from the dates in the plan's and the review's file names. The
  dates ride the slugs, so no state is stored; the same derivation aggregated across
  features is tech-writer's cycle-times table.
- Overall: **accepted** / **accepted with notes** / **changes required**.
- Per-criterion table: item, verdict, evidence.
- Then: deviations found, proposed spec amendments, questions for the user, what remains
  unverifiable — "check on a live environment" is a legitimate verdict, hand it over as a
  task, not a hope.
- **Proposed amendments carry an explicit status** — `proposed` when written; the user's
  decision updates it to `accepted YYYY-MM-DD` or `rejected YYYY-MM-DD (<reason in one
  line>)`. The reviewer records the decision, never makes it. An amendment left
  `proposed` stays open across reports: the next review re-verifies the gap and carries
  the amendment forward with its age — a proposal nobody decided on is a debt the
  pipeline owes, visible until paid. An amendment that changes an existing contract or
  public interface carries its blast-radius class — **breaking** (some existing
  consumer breaks; a migration note is part of the amendment) or **additive** — so the
  user decides on the blast radius, not just the wording.
- **Changes required** items go back into the plan as tasks; a finding that is a plain
  bug rather than a spec deviation goes to root-cause (a known failing case — the dev
  role, if installed) or bug-hunt (a wider adversarial sweep of the area). This skill
  does not fix code.
- **The review loop converges or says so.** A re-review after fixes re-verifies the
  failed rows and walks fresh ground; a pass with zero failed criteria and zero
  actionable deviations is terminal — report it as `Converged: pass N`, and write
  nothing new to look busy (a re-review that invents filler findings has stopped
  reviewing). Until then every report names what is still open.

## Rules

- **Evidence, not impressions**: every verdict cites a test, a code location, or an
  observation. "Looks fine" is not a verdict.
- **The reviewer does not fix**: fixes return to the plan and the executor. Fixing what
  you review destroys the independence that makes the review worth anything.
- **A failure is not negotiable silently**: if the user overrides a failed criterion,
  record it as an accepted deviation — never reclassify it as passed.
- Write the report in the team's working language, which may differ from the language of this skill.

## Next

Passed → merge is the user's call. Unverifiable criteria → `stand-acceptance` on the
stand; a deeper quality pass → `code-review`; bugs and security → `bug-hunt`. Failed
findings return to the plan and the executor.
