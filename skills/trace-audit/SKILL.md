---
name: trace-audit
description: Mechanical audit of the spec pipeline's own artifacts — walk docs/specs/ and docs/plans/ and report what the pipeline left behind. Checks — must criteria without a runnable Verify, parent/children desync, implementation without a review, findings that never closed across reports, plans stuck on blocked tasks. Use when the user asks for a traceability audit or pipeline health, "what's uncovered", "which specs never got reviewed", or before a release to see the gaps the busy flow skipped. Reports only — the fixes route to their owning roles.
---

# Trace audit

The pipeline's artifacts promise each other things: every must criterion names its
`Verify:`, every child appears in its parent's `children`, every implementation gets a
review, every finding gets closed or carried. Under deadline those promises are exactly
what gets skipped — silently. This skill walks the artifact tree and reports every
broken promise; it is the pipeline auditing itself.

The auditor reports. Fixes belong to their owning roles: spec defects → amendments
(analyst), missing reviews → a qa task, stuck plans → dev. Nothing is edited here.

## Flow

```
1 gather the artifact tree → 2 run the checks → 3 route the findings → 4 report
```

## 1. Gather the artifact tree

- All specs in `docs/specs/` (business, `-implementation`, `-<repo>`, reports
  `*-quality` / `*-audit` / `*-review`), all plans in `docs/plans/`, the cases
  artifacts in `docs/tests/` and the QA reports in `docs/qa/` (`*-gaps`,
  `*-triage`). One `ls` each; where `.kbindex/` exists, its index is a cross-check,
  not a source.
- An empty `docs/specs/` — say so and stop: there is nothing to audit.
- Parse what each check needs: frontmatter (`id`, `parent`, `children`, `status`),
  numbered criteria with their must/should mark and `Verify:` field, plan tasks with
  `- Done:` / `- Blocked by:` lines, report findings tables and `Re-verified:` /
  `Recurring:` lines.

## 2. The checks

- **Orphan criteria.** Every must criterion of every spec carries a `Verify:` that names
  a runnable command; a "manual — who observes what" check is legitimate but is listed
  separately (it waits on a person, not on nothing). A must with no `Verify:` at all is
  the finding — it can never produce an evidence-backed verdict in spec-review.
- **Traceability desync.** Every artifact's `parent` resolves to an existing file whose
  `children` lists it back; every `children` entry resolves to an existing file; the id
  in the frontmatter matches the file's slug. One-way links, dead links, and id/slug
  mismatches are findings (documentation defects — same class spec-review flags, here
  found repo-wide instead of per feature).
- **Criterion ↔ case coverage** (where `docs/tests/` holds cases artifacts): a must
  criterion no case exercises, and a case row exercising a criterion no spec carries,
  are both findings — `test-design`'s script (`cases.mjs check`) decides them
  mechanically; this audit quotes its output. A duplicate or retired-then-reused
  TEST-ID across the artifacts is the same class of breakage as a parent/child desync.
- **Implementation without a review.** A spec chain whose repo specs have an
  implementation plan with closed tasks but no `*-review` report for the chain: work
  shipped without acceptance. A chain mid-implementation is not a finding — it is
  listed as in-flight only.
- **Findings that never closed.** Walk each feature's reports in date order: a finding
  marked closed in a later report is done; a blocker or worth-fixing finding with no
  later report at all, or carried `not closed` into the latest one, is open — named
  with its age (reports between then and now). `Recurring:` classes appearing in two or
  more consecutive reports are the process-level finding: the same class surviving
  every pass means the fix belongs in CODESTYLE.md (tech-writer's territory — propose,
  don't write).
- **Stuck work.** Plan tasks marked `- Blocked by:` whose blocking open question the
  owning spec still lists as open — the block is honest. A blocked task whose question
  the spec no longer lists (resolved or removed) is stale blocking: work waiting on
  nothing.
- **The untriaged queue.** Open items in the newest `*-triage` report that no later
  report re-verified and no plan task carries: findings that fell out of the loop
  between triage and routing. A `needs-info` item aging across two triages is the
  same debt, named.
- **Status honesty.** A spec `status: draft` with downstream children or closed
  implementation tasks — the artifact outgrew its status; a `status: approved` spec
  with no approval trail in Amendments is the reverse finding.

## 3. Route the findings

Every finding names its owner in the report — the audit ends actionable, not
picturesque:

- spec defects (orphan criteria, desync, status) → amendments through the analyst
  role;
- missing reviews → a qa task (spec-review in a fresh session);
- open and stale findings → the owning plan (dev role) or root-cause for single bugs;
- recurring classes → a CODESTYLE.md anti-pattern proposal for tech-writer.

## 4. Report

- Persist as `docs/specs/YYYY-MM-DD-pipeline-trace.md` — a repo-level report, not a
  feature's (the `-trace` suffix keeps it out of the `-quality`/`-audit`/`-review`
  report family).
- Findings table: `location | check | finding | owner`. Counts per check in the
  summary; the outcome line is **clean** (nothing owed) / **findings listed** /
  **uncovered acceptance** (implementation shipped without review — the release-blocking
  class).
- In-flight chains (mid-implementation, honest blocks) are listed in a separate
  "working as intended" section — the audit must not cry wolf about normal work.

## Rules

- **Mechanical, not judgmental**: every finding is a broken promise between artifacts,
  checkable by re-reading them. "This spec seems thin" is not a finding here — that is
  spec-review's judgment, per feature.
- **The auditor does not fix** — no artifact is edited; findings route to their owners.
- **Silence is a finding's absence, not evidence of health**: a check with nothing to
  walk (no plans directory, no reports yet) is reported as "nothing to check", never as
  "passed".
- Write the report in the team's working language, which may differ from the language
  of this skill.
