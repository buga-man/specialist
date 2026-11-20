---
name: test-analysis
description: The spec-side adversarial pass of QA — attack the specification the way bug-hunt attacks code. Finds holes (undefined behavior, missing error paths, contradictions, undefined terms), mines important but missed acceptance criteria (contract error rows, UI element rows, data invariants, NFRs), enumerates corner-case axes systematically (boundaries, state transitions, dual modes, permissions, concurrency), and formalizes vague wording into decision tables and grader-typed Verify entries (command / stand / manual / model). Runs on a draft spec before planning — a hole in text costs minutes, the same hole in code costs days. Use when the user asks to probe requirements, find spec gaps, check acceptance criteria for completeness, or before implementation planning on a nontrivial feature.
---

# Test analysis (probing the specification)

The spec is a product, and this skill hunts its defects. `bug-hunt` assumes the code is
broken; test-analysis assumes the **spec is incomplete** — the author wrote the happy
path and what they remembered. The output is not a verdict on code (none exists yet);
it is a gaps report: named holes, criteria the spec should have but does not, and
corner cases nobody wrote down — each as a ready-to-paste criterion the analyst can
accept as an amendment.

Runs best on a draft or freshly approved spec, before implementation-plan. Works on
the business spec (criteria, cases) with the system/repo specs as context (contracts,
element tables). A trivial fix skips this skill (the fast lane); a cross-repo contract
change never does.

## Flow

```
1 read the chain → 2 mechanical probe (script) → 3 holes pass → 4 mine the missed criteria
→ 5 corner-case axes → 6 formalize → 7 the gaps report
```

## 1. Read the chain

- The business spec is the primary target: criteria, business cases, open questions.
- The system/repo specs supply the mining surface (contract error tables, field lists,
  UI elements tables) and the checks of the formal pass: contradictions between
  documents, an error row no criterion covers, a term used but never defined in the
  glossary.
- A `docs/tests/*-cases.md` artifact for this topic, when one exists, joins the
  surface — the gaps report and the cases artifact must not disagree about coverage.

## 2. The mechanical probe — the script

```bash
node "<skill-dir>/scripts/probe.mjs" docs/specs/<spec>.md
```

`<skill-dir>` is the directory of this SKILL.md — the host reports it when the skill
loads; resolve the path from there.

The script catches what needs no judgment: a must criterion without a `Verify:`,
duplicated criterion texts, unmeasurable wording (the bilingual vague list), the
must-count band, and three hole signals — no error-path criterion, no boundary
criterion, dual-mode keywords with no both-modes criterion. Fix what it names in the
report; the judgment passes below catch the rest. Exit 1 means errors — the spec is
not ready to hand downstream even if the prose reads well.

## 3. Holes — what the spec does not say

- **Undefined behavior** — for each action and each data element, the cases the spec
  never answers: what happens on empty, on invalid, on the second attempt, when the
  actor lacks permission. Each unnamed case is a hole, named as a question.
- **Missing error paths** — every failure the flow can meet and the spec does not
  route: partial failure midway, timeout, retry, rollback visibility.
- **Contradictions** — between criteria, between spec and system spec (a field the
  repo spec requires the system spec never carries), between criteria and recorded
  decisions.
- **Undefined terms** — a word a criterion depends on that the glossary does not
  define; an undefined term makes its criterion unverifiable, however well shaped.

## 4. Mine the missed criteria

Systematic sources — each row of these is a criterion waiting to be written:

- **Contract error tables** (system spec §3): every error row a consumer can receive
  is an observable behavior — a criterion per row.
- **UI elements tables** (repo spec): element × visible-when × behavior — each cell a
  checkable claim.
- **Data invariants** — uniqueness, referential integrity, ordering, limits the prose
  assumes but never states.
- **NFRs hiding in prose** — "fast", "reliable", "supports many users" become criteria
  only with the four fields — criterion + measurement method + threshold + environment.
  Missing any field is the hole; the proposed criterion supplies all four.
- **Business cases' failure continuations** — each case step that can fail has an
  outcome nobody specified.
- **History** — the area's prior `*-audit` / `*-triage` / `*-gaps` reports: every
  defect class that fired there proposes a criterion against its recurrence.

The diff is the deliverable: enumerate the mined criteria, strike the ones the spec
already has (naming where), and the remainder is the missed-criteria list.

## 5. Corner-case axes — enumerate, do not recall

Walk every data element and interaction by axes, in order — a case found by walking
the axis list, not by remembering:

- **Boundaries** — empty / null, one, many, max, negative, zero, unicode, timezone
  and DST edges, clock skew.
- **State transitions** — states enterable but never left and never re-entered; the
  incomplete transition table; the transition nobody forbids.
- **Dual modes** — every mode/flag/environment pair (sandbox vs production, flag on
  vs off, dev vs prod login): each pair needs both columns checked. The same model
  writing and reviewing shares one blind spot here — this axis catches it.
- **Permissions** — actor × action grid; the empty cells are holes.
- **Concurrency** — simultaneous edits, double submit, check-then-act on shared state.

This axis list is the canonical one — `test-design` §3 executes the same five as case
rows; a change here lands there in the same edit, or the two skills drift.

### Scouts — parallel axes and sources (stages 4–5, a wide spec)

The six mining sources (§4) and the five axes (§5) are independent readers —
each walks its own surface of the same spec. A wide spec may fan them out
read-only through the `scouts` skill: one scout per source or per axis, each
returning its raw candidates — holes as questions, mined criteria with their
evidence line. The grant, the mission charter, and the fan-in rules live in
`scouts`. What stays central regardless: the mined-criteria diff and its dedupe
(strike what the spec already has — one number space), the axis coverage note,
the formalization pass (§6), and the report. The probe script never fans out.
Without a grant the same passes run sequentially — the gaps report's contract
does not change.

## 6. Formalize the vague

A vague criterion does not get deleted — it gets a table:

- **Decision table** — conditions × actions; every rule row becomes an EARS criterion
  with its own `Verify:`. Ambiguity survives as an incomplete table (a condition
  combination with no action row) — visible, countable, fixable.
- **State table** — for stateful behavior — the transition table IS the spec; prose
  bows to it.

## 7. The gaps report

- Save as `docs/qa/YYYY-MM-DD-<topic>-gaps.md` — a QA report, not a spec-chain link
  (it never closes a chain, so it stays out of docs/specs/).
- Every finding is one of: **hole** (the unnamed case, as a question), **missed
  criterion** (ready to paste — EARS shape, must/should, and a `Verify:` with a
  grader type), **contradiction** (both sides quoted), **vague** (the proposed
  decision table attached).
- **Grader types** — every proposed `Verify:` names who decides:
  `Verify: command — <cmd> → <expected>` (deterministic; the default to aim for),
  `Verify: stand — <what is observed on the live stand>`,
  `Verify: manual — <who observes what>`,
  `Verify: model — <the judgment call>` (a last resort, marked honestly — a model
  grader never proves; it opines).
- The report proposes, the analyst decides: findings travel to the owning spec as
  **amendments the user approves** — this skill never edits a spec silently.
- The report ends with counts by class and the axis coverage note (which axes were
  walked, which had nothing to find — silence per axis is recorded, not assumed).

## Rules

- **A hole is a question, not an invention** — the skill never answers for the spec;
  it names what the spec left unanswered and proposes the shape of the answer.
- **Every proposed criterion is verifiable** — EARS shape, must/should mark, grader
  type; a proposal without a `Verify:` repeats the disease it treats.
- **The probe script runs before judgment** — its findings are quoted in the report;
  a report that skips a script error explains why.
- **Proportionality** — the pass scales with the blast radius (system-thinking's
  classes); a small feature gets the probe and the axes, a cross-repo change gets
  every pass.
- Write the report in the team's working language, which may differ from the
  language of this skill.

## Next

Missed criteria and holes → amendments through the analyst role (the user approves).
The accepted criteria → `test-design` — the cases artifact turns them into a
TEST-ID'd executable suite; `implementation-plan` may start in parallel on the
unaffected tasks.
