---
name: code-review
description: Review a diff for code quality and logic — how well the change is written and whether it does its work efficiently. Use when the user asks to review code quality, readability, structure, naming, or to look for suboptimal logic (needless work, N+1, accidental complexity) on a branch or diff. Reads the diff with the code around each hunk, the repo's CODESTYLE.md where present, and the tests; produces findings with file:line evidence and severity, persisted as a report. Spec compliance belongs to spec-review; bugs and security holes belong to bug-hunt. Runs best in a fresh session — the reviewer does not fix.
---

# Code review

Review how well the change is written. Not what it does against the spec — that is
spec-review's oracle — and not what will break or can be exploited — that is bug-hunt's.
Two questions only: could a new developer maintain this code a month from now, and does
it do its work without needless effort.

Run in a fresh session when possible; the reviewer does not fix what it reviews.

## Flow

```
1 scope & context → 2 quality pass → 3 logic pass → 4 findings & report
```

## 1. Scope and context

- The diff — the branch against its base (or the named commits) — plus the code around
  each hunk: the callers, the module, the repo's existing patterns. A hunk reviewed in
  isolation lies.
- `CODESTYLE.md` at the repo root, where present — the documented conventions are the
  oracle for style findings; a style finding cites the rule it breaks. No document —
  style stays a note at most.
- The tests the diff carries: code and tests are reviewed as one judgment, not two.
- A previous `*-quality` report for the topic (one glob: `ls docs/specs/*<topic>*`) →
  open by re-verifying its findings (see §4), then review fresh ground. The old report
  is input, never truth: a finding marked fixed is re-proven, not believed.

## 2. Quality pass — how it reads

- **Intent vs naming**: do the names say what the code does? A reader should not need
  the body to trust the name.
- **Structure**: a function or module does one job; nesting depth and branch counts a
  reader can hold in their head; long parameter lists; levels of abstraction mixed.
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

## 4. Findings and report

- Persist the report as `docs/specs/YYYY-MM-DD-<topic>-<repo>-quality.md`, next to the
  specs of the feature — findings must stay navigable, not live in chat.
- Findings live in a table — one row per finding: `location | class | severity |
  direction` — classes from the two passes (naming, structure, duplication, dead
  weight, error idioms, tests; needless work, data fit, hot path, accidental
  complexity, premature optimization) — so the next pass and tech-writer's report card
  can count them.
- Each finding: location (`file:line`), what and why, a proposed direction — a
  direction, not a patch; the reviewer does not fix.
- Severity per finding:
  - **blocker** — unmaintainable as is, or the design will hurt every future change;
  - **worth fixing** — real cost, fixable in the normal flow;
  - **note** — the reader should know; style nits live here.
- **Re-verification** (when a previous report exists): its carried findings get a
  status — **closed** (re-proven: the problem is gone at that location), **not
  closed**, or **fixed with regression** (the old problem gone, a new one opened — a
  fresh finding, severity one step up). The header line: `Re-verified: N closed, M not
  closed, K regressions`.
- The report ends with `Recurring: <class>[, <class>…]` — the finding classes this
  report shares with its predecessor (`Recurring: none` when empty). That line is the
  pipeline's review memory: tech-writer aggregates these into CODESTYLE.md
  anti-pattern proposals.
- Outcome: **clean** / **worth a pass** / **rework required**.
- Blockers and worth-fixing findings go back into the plan as tasks; notes ride along.

## Rules

- **Evidence, not impressions**: every finding cites a code location — and a CODESTYLE
  rule where the finding is stylistic.
- **Not a linter**: what the project's lint configs already catch is a one-line pointer
  to the config, never a re-description of the rule.
- **The reviewer does not fix**: fixes return to the plan and the executor.
- **Severity honesty**: a style nit inflated to a blocker burns the trust that makes the
  next report worth reading.
- Write the report in the team's working language, which may differ from the language of
  this skill.
