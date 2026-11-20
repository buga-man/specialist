---
name: test-design
description: Turn approved acceptance criteria and business cases into a TEST-ID'd executable cases artifact — a scenario matrix (main / alternate / exception / regression), boundary values per data element, decision and state tables for formalization, and a grader type on every case (command / stand / manual / model). The artifact is the one contract three skills consume — spec-review walks it case by case, spec-implementation mines it for red tests, stand-acceptance runs its stand cases; root-cause's regression tests join the same registry. Use when the user asks to design test cases, write a test suite or a test plan from a spec, prepare acceptance material, or extend coverage after new criteria were accepted.
---

# Test design (the cases artifact)

Criteria say what must hold; cases say how each is exercised. This skill writes the
bridge: one artifact per feature-repository pair, every case carrying a stable
TEST-ID, a grader, and an input → expected pair concrete enough that a fresh session
can run it without conversation. The registry of IDs is what makes coverage checkable
in both directions — a criterion no case exercises, and a case exercising nothing the
spec asked for, are both findings `trace-audit` can see.

Runs after the criteria are accepted (brainstorm, or test-analysis's accepted
amendments) and before or during implementation — the cases are the material
`spec-implementation` turns into red tests first.

## Flow

```
1 gather (criteria, cases, contracts, elements tables, gaps report) → 2 the matrix
→ 3 boundaries and axes → 4 regression section → 5 write the artifact → 6 check
```

## 1. Gather

- The business spec — criteria with must/should marks and their `Verify:` graders.
- Business cases (actor → action → outcome) — each becomes the spine of a scenario.
- The system/repo specs — contract error rows and UI elements tables are pre-made
  case rows.
- The area's prior `*-audit` / `*-triage` reports — every past defect proposes a
  regression case.
- The test-analysis gaps report for this topic, when one exists — accepted criteria
  arrive with their cases already half-written.

## 2. The scenario matrix

Per business case: **main** (the happy path as specified), **alternate** (each named
alternative flow), **exception** (each failure the spec routes). One row per scenario —
a case with "and" in its title is two rows. Empty cells are written as empty, never
silently skipped: "no alternate flows" is a claim the artifact owns.

## 3. Boundaries and axes

- Every data element the criteria name gets its boundary rows (empty / one / many /
  max / negative / unicode, timezone and DST where time is involved) — enumerated by
  axis, not recalled.
- Dual modes, permissions (actor × action), concurrency (double submit, simultaneous
  edit), state transitions — the same axes test-analysis walks, now as executable
  rows.
- **Formalization**: where the prose is conditional, the artifact carries the decision
  table (conditions × actions); where stateful, the transition table. Each row of
  either IS a case — the table is the spec of the case, prose bows to it.

## 4. The regression section

Cases that exist because something once broke: each prior defect of the area becomes
a row (source: the report that recorded it). The `code-review` stale-impact list
("tests that may now lie") names the rows to re-verify after a change. A regression
case without a source is a guess — cut it or find its report.

## 5. Write the artifact

`docs/tests/YYYY-MM-DD-<topic>-<repo>-cases.md` — a tree of its own, deliberately not
`docs/specs/`: a cases file is not a spec-chain link and must not feed the chain
heuristics.

```markdown
# <Topic> — <repo> test cases

- Specs: business <link> · repo <link>
- Cases artifact of the <topic> feature; IDs are stable — a case is never renumbered,
  a removed case leaves its ID retired (not reused).

## Cases

| ID | Criterion | Type | Grader | State / input | Expected |
|---|---|---|---|---|---|
| TEST-<TOPIC>-001 | 1 | main | command | submit form with valid data | record saved, exit 0 |
| TEST-<TOPIC>-002 | 1 | boundary | command | submit with empty required field | rejected with field-level error |
| TEST-<TOPIC>-003 | 2 | exception | stand | API returns 503 on submit | UI shows the retry dialog, data preserved |
| TEST-<TOPIC>-004 | — | regression | command | double-submit the form | one record created (source: 2026-11-05 audit) |

## Decision table — <criterion 4>
| cond A | cond B | action |
|---|---|---|
...

## Re-verify after change
- TEST-<TOPIC>-001, TEST-<TOPIC>-003 — subject touched by the 2026-12-01 diff
```

Rules of the table:

- **Criterion** — the business-spec criterion number(s) this case exercises, `—` for
  a regression case tied to a defect rather than a criterion.
- **Type** — main / alternate / exception / boundary / dual-mode / permission /
  concurrency / state / regression.
- **Grader** — who decides: `command` (deterministic — the default; expected carries
  the command or its observable), `stand` (observed on the live stand),
  `manual` (a named human check), `model` (a judgment call — last resort, marked).
  The same model writing and reviewing shares one blind spot: a case that can be a
  `command` never ships as a `model`.
- **State / input** and **Expected** — concrete enough to run: exact inputs, exact
  observable outcomes. "Works correctly" is not an expected value.

## 6. Check — the script

```bash
node "<skill-dir>/scripts/cases.mjs" check docs/tests/<cases>.md docs/specs/<spec>.md
```

`<skill-dir>` is the directory of this SKILL.md — the host reports it when the skill
loads; resolve the path from there. The script catches what needs no judgment:
malformed or duplicate IDs, unknown criterion references, missing grader/type/
expected cells, and the coverage both ways — a must criterion no case exercises
(error), a should criterion without one (note). Exit 1 means the artifact does not
yet hold; fix what it names before handing the file downstream.

## Consumers (what makes the artifact worth writing)

- **spec-review** — the verdict walk runs case by case: each TEST-ID gets its own
  evidence-backed result; the per-criterion table cites the cases that decided it.
- **spec-implementation** — each `command`-graded case is a red-test candidate
  (`Verify (red)`); the executor implements against the same table.
- **stand-acceptance** — the `stand`-graded rows are the stand script.
- **root-cause** — a fixed defect's regression test joins the registry under its
  TEST-ID (the plan task names it), so the artifact and the suite never drift apart.
- **trace-audit** — criterion ↔ case coverage in both directions, mechanically.

## Rules

- **One artifact per feature-repository pair** — never one file for a cross-repo
  feature (per-repo cases, mirroring the repo specs).
- **IDs are stable** — renumbering breaks every reference; retire, never reuse.
- **Proportionality** — the matrix scales with the blast radius; a fast-lane change
  gets its cases inside the quick plan, not this artifact.
- **The artifact never invents criteria** — a case exercising behavior no criterion
  names is a finding for test-analysis (a missed criterion), not a silent row.
- Write the artifact in the team's working language, which may differ from the
  language of this skill.

## Next

The accepted artifact feeds `spec-review` (verdicts per TEST-ID) and
`spec-implementation` (red tests); `stand`-graded rows go to `stand-acceptance`;
findings discovered while designing cases go back through `test-analysis` as
amendments.
