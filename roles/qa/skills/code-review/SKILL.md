---
name: code-review
description: Review a diff for code quality and logic — how well the change is written and whether it does its work efficiently. Use when the user asks to review code quality, readability, structure, naming, or to look for suboptimal logic (needless work, N+1, accidental complexity) on a branch or diff. Reads the diff with the code around each hunk, the repo's CODESTYLE.md and the specs' recorded decisions where present, and the tests; also maps the diff's stale impact on the existing suite (tests to re-run, tests that may now lie, coverage silently removed); produces findings with file:line evidence and severity, persisted as a report that opens with a change map — heart / consequences / glue — and closes it with a Not-reviewed line (no changed file skipped in silence). Spec compliance belongs to spec-review; bugs and security holes belong to bug-hunt. Runs best in a fresh session — the reviewer does not fix.
---

# Code review

Review how well the change is written. Not what it does against the spec — that is
spec-review's oracle — and not what will break or can be exploited — that is bug-hunt's.
Two questions only: could a new developer maintain this code a month from now, and does
it do its work without needless effort.

Run in a fresh session when possible; the reviewer does not fix what it reviews.

## Flow

```
1 scope & context → 2 quality pass → 3 logic pass → 4 stale-impact pass
→ 5 findings & report
```

## 1. Scope and context

- The diff — the branch against its base (or the named commits) — plus the code around
  each hunk: the callers, the module, the repo's existing patterns. A hunk reviewed in
  isolation lies.
- `CODESTYLE.md` at the repo root, where present — the documented conventions are the
  oracle for style findings; a style finding cites the rule it breaks. No document —
  style stays a note at most. A `## Principles` section there, where the project
  keeps one, outranks style: a diff violating a MUST principle is a **blocker** on
  that alone — the finding quotes the principle and carries the proof a blocker
  owes; a violated SHOULD principle is a worth-fixing finding citing the principle.
- The spec chain's **recorded decisions** — the "Decisions and rationale" sections of
  the feature's system/repo specs, where the feature has them. Code that contradicts
  a recorded decision (a rejected alternative implemented, a reversibility promise
  broken) is a finding even when it is clean and passes its tests: recorded decisions
  are load-bearing history, not suggestions. No spec chain — nothing to check here;
  never hunt for decisions in commit messages instead.
- The change-impact **before-list**, when the dev role left one — the promised scope: the
  diff is read against it; a before-item that got neither its change nor a "not needed"
  mark is a finding.
- The tests the diff carries: code and tests are reviewed as one judgment, not two.
- A previous `*-quality` report for the topic (one glob: `ls docs/specs/*<topic>*`) →
  open by re-verifying its findings (see §5), then review fresh ground. The old report
  is input, never truth: a finding marked fixed is re-proven, not believed.
- **A large diff gets a review order before it gets a review.** Rank the touched files
  by churn — `git log --follow` commit frequency — and by centrality (shared modules
  before leaf code): hot widely-imported files get the deep read, cold leaves get
  breadth; a flat pass spends its depth on files nobody changes.
- **The diff is committed work**: a branch diff does not see staged or uncommitted
  changes — commit first, then review; reviewing a working tree reviews work nobody
  asked to accept.

### Scouts — parallel deep reads (a large diff)

The review order above is already a mission split, and re-verifying a prior
report's findings is per-finding work — both fan out read-only through the
`scouts` skill: one scout per hot file's deep read (the hunk, its callers, the
module, the repo's patterns), one per carried finding being re-proven at its
`file:line`. The grant, the mission charter, and the fan-in rules live in
`scouts`. What stays central regardless: the duplication grep (cross-file by
definition), the findings table with its pre-report gate, the stale-impact
lists. Without a grant the same passes run sequentially in this session — the
report's contract does not change.

## 2. Quality pass — how it reads

- **Intent vs naming**: do the names say what the code does? A reader should not need
  the body to trust the name.
- **Structure**: one job per function or module; nesting and branch counts a reader can
  hold in their head; long parameter lists; mixed abstraction levels.
- **Duplication**: grep the diff's new symbols against the repo — code duplicating
  existing functionality is a finding even when the plan ordered it; the fix goes back
  into the plan, not in here.
- **Dead weight**: dead code, leftover scaffolding, commented-out code, flags that are
  always one value.
- **Error handling**: matching the repo's idioms — swallowed errors and silent
  fallbacks are the default suspects.
- **Tests as a mirror**: tautological tests that pass but check nothing; tests bound to
  the implementation instead of the behavior they should protect.

## 3. Logic pass — how much work it does

- **Needless work**: repeated computation, N+1 queries or calls, parsing or reading
  inside a loop what could be read once, allocations on a hot path.
- **Data structure fit**: the right shape for the question asked — a map lookup instead
  of a linear scan — judged against the expected data sizes, not theoretical complexity
  alone.
- **Hot vs cold paths**: optimize the hot path, keep the cold path simple; complexity
  spent where nobody waits is waste.
- **Accidental complexity**: layers that only move data along, abstractions with one
  caller, guard conditions that guard nothing.
- **Premature optimization is also a finding**: complexity bought without a measured
  need — simplicity is the default the change must argue its way out of.

## 4. Stale-impact pass — what the diff does to the existing suite

The diff does not end at its edge: it acts on the tests that already exist. A change
can leave every new test green and still make the suite dumber. Walk the diff against
the existing suite and produce three lists:

- **Re-run** — existing tests whose subject the diff touches: behavior they pin has
  moved, they must still hold.
- **May now lie** — tests whose subject changed *under* them without the test noticing:
  an assertion hardcoded to the old value, a mock of a signature that grew a parameter,
  a snapshot drifting. These pass today and are wrong about tomorrow.
- **No longer covered** — coverage the diff silently removed: deleted tests, weakened
  assertions (an exact equality relaxed to a substring), a `skip` slipped in. Removing
  a check is a change like any other — the most consequential ones look like cleanup.

Tag each entry **Must / Should / Optional** by what it protects: a lying test on a hot
path is a Must; a leaf's coverage gap is Optional. The three lists ride in the report
(§5) next to the findings — they are the suite's half of the review.

## 5. Findings and report

- Persist the report as `docs/specs/YYYY-MM-DD-<topic>-<repo>-quality.md`, next to the
  specs of the feature — findings must stay navigable, not live in chat.
- The report opens with a **change map** — the review order of §1 made visible to the
  reader: the **heart** (the files carrying the change's intent), the
  **consequences** (what the heart moves: callers, tests, config), the **glue**
  (generated files, renames, mechanical churn) — one sentence on why the heart is
  the heart, not a file-by-file retelling; the diff itself is the inventory. A
  small diff's map is a single line. The map ends with the coverage line
  `Not reviewed: N — <files>`, written as `Not reviewed: none` when N is 0: every
  changed file is in the map, in the findings, or named as not reviewed — a
  reviewer quietly skipping files is the report's blind spot.
- Findings live in a table — one row per finding: `location | class | severity |
  direction` — classes from the passes (naming, structure, duplication, dead
  weight, error idioms, tests; needless work, data fit, hot path, accidental
  complexity, premature optimization; decisions — a recorded decision contradicted)
  — so the next pass and tech-writer's report card can count them.
- Each finding: location (`file:line`), what and why, a proposed direction — a
  direction, not a patch; the reviewer does not fix.
- A findings table caps at **50 rows**; the rest collapse into one overflow line —
  `+N more (X blocker, Y worth fixing, Z note)` — a table nobody finishes protects
  nothing. Overflow findings still route into the plan; they just do not scroll.
- **Pre-report gate** — four checks before a finding enters the table; any fail → not
  a finding:
  1. the exact spot can be quoted (`file:line`) — "somewhere in the auth layer" is a
     hunch, not a finding;
  2. a concrete scenario can be told — input, state, bad outcome; a smell without a
     story is pattern-matching, not review;
  3. the surrounding context is read — callers, imports, tests; many "problems" are
     handled one frame up;
  4. the severity survives challenge — see Severity honesty below.
- **Known false positives — do not report**: error handling a middleware or calling
  layer already owns; "magic numbers" that are the domain's vocabulary — 200/404 in an
  HTTP handler; "too long" aimed at a dispatch table — length is the shape there; an
  N+1 over a knowingly tiny set; TODO/FIXME in code the diff did not touch; crypto-hardening demands on code that moves no secrets; production-
  grade demands on example, fixture, or doc-snippet code — a finding names its
  source kind (live / fixture / example / dead), and only live code carries
  production weight.
- Severity per finding:
  - **blocker** — unmaintainable as is, or the design will hurt every future change;
  - **worth fixing** — real cost, fixable in the normal flow;
  - **note** — the reader should know; style nits live here.
  - A blocker carries proof: the snippet, its line, the hurt scenario, and why the
    defenses in place — tests, types, middleware — do not catch it. No proof → downgrade.
- **Re-verification** (when a previous report exists): its carried findings get a
  status — **closed** (re-proven gone), **not closed**, or **fixed with regression**
  (old problem gone, a new one opened — a fresh finding, severity one step up).
  Header line: `Re-verified: N closed, M not closed, K regressions`.
- The stale-impact lists (§4) close the report — re-run / may-now-lie / no-longer-covered,
  each entry with its Must/Should/Optional tag; an empty pass is written as empty ("the
  diff leaves the existing suite untouched" is a claim the report owns).
- The report ends with `Recurring: <class>[, <class>…]` — the finding classes shared with
  the previous report (`none` when empty); tech-writer aggregates them into CODESTYLE.md
  anti-pattern proposals.
- **Spec silence is not permission**: unnamed behavior is graded by its effect on a
  reasonable user, not waved through because no criterion mentions it — the spec chain's
  `unrequested` class routes on it. Grading a finding Minor because the spec was silent
  has graded the spec, not the effect.
- **The set-aside list**: everything considered but not judged — the smell dismissed, the
  risky pattern read as deliberate — lands in the report, one line each; the executor
  rules on each, and nothing dies silently in the reviewer's head.
- **Zero findings is a valid verdict** — filler nits and speculative "consider using X"
  are the reviewer's chief failure mode. Final test of every finding: would a senior
  here actually change this? No → drop it.
- **The loop converges or says so**: a re-review after fixes that yields zero blockers
  and zero worth-fixing findings is terminal — `Converged: pass N` in the header next
  to the `Re-verified:` line, no new sections written to look busy. Until then every
  pass names what is still open.
- Outcome: **clean** / **worth a pass** / **rework required** — clean is an approve,
  never withheld for the look of rigor.
- Blockers and worth-fixing findings go back into the plan as tasks; notes ride along.

## Rules

- **Evidence, not impressions**: every finding cites a code location — and a CODESTYLE
  rule where the finding is stylistic.
- **Not a linter**: what lint configs already catch is a one-line pointer, never a
  re-description.
- **The reviewer does not fix**: fixes return to the plan and the executor. **Severity
  honesty**: a style nit inflated to a blocker burns the trust the next report needs.
- Write the report in the team's working language, which may differ from the language of
  this skill.

## Next

Findings go to the dev role as fix work (the reviewer does not fix); a re-review after
fixes reads the diff against the same before-list. Zero findings → the verdict is clean —
say so and stop.
