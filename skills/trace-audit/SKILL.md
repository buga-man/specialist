---
name: trace-audit
description: Mechanical audit of the spec pipeline's own artifacts — walk docs/specs/ and docs/plans/ and report what the pipeline left behind. The walk script (walk.mjs) catches what needs no judgment — must criteria without a Verify, parent/children desync, dead links, id/slug mismatch, TEST-ID reuse across the registry, stale blocking, draft status outgrown; the judgment checks add implementation without a review, findings that never closed across reports, the untriaged queue. Use when the user asks for a traceability audit or pipeline health, "what's uncovered", "which specs never got reviewed", or before a release to see the gaps the busy flow skipped. Reports only — the fixes route to their owning roles.
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
1 gather the artifact tree → 2 the mechanical walk (script) → 3 the judgment checks
→ 4 route the findings → 5 report
```

## 1. Gather the artifact tree

- All specs in `docs/specs/` (business, `-implementation`, `-<repo>`, reports
  `*-quality` / `*-audit` / `*-review`), all plans in `docs/plans/`, the cases
  artifacts in `docs/tests/` and the QA reports in `docs/qa/` (`*-gaps`,
  `*-triage`). One `ls` each; where `.kbindex/` exists, its index is a cross-check,
  not a source.
- An empty `docs/specs/` — say so and stop: there is nothing to audit.
- Parse what each check needs: frontmatter (`id`, `parent`, `children`, `status`),
  numbered criteria with their must/should mark and `Verify:` field (markers and label
  read bilingually, like the heading), plan tasks with
  `- Done:` / `- Blocked by:` lines, report findings tables and `Re-verified:` /
  `Recurring:` lines.

## 2. The mechanical walk — the script

```bash
node "<skill-dir>/scripts/walk.mjs" [docs-root]        # default docs
```

`<skill-dir>` is the directory of this SKILL.md — the host reports it when the skill
loads; resolve the path from there. The script catches the promises that need no
judgment:

- **Traceability desync** — a `parent` that resolves to no artifact or to one whose
  `children` does not list it back; a `children` entry that resolves to nothing; a
  frontmatter `id` absent from the file's slug.
- **Orphan criteria** — a must criterion without a `Verify:`, in every spec at once
  (the criteria heading is read bilingually — the working language may be either).
- **TEST-ID registry** — an ID reused across cases artifacts or twice in one: IDs are
  stable, retired, never reused, and the registry is global across `docs/tests/`.
- **Stale blocking** — a `- Blocked by: open question #N in <spec>` line whose spec's
  Open-questions table no longer carries #N (work waiting on nothing), or that names a
  spec the tree does not carry (a dead link).
- **Status honesty, the mechanical half** — `status: draft` with children, or with a
  plan of the same topic carrying closed tasks.

Exit 1 means findings — quote them in the report as stated (each is a re-derivable
fact, not a judgment). Silence per directory is reported as "nothing to check", never
as passed. What the script cannot see is §3's work.

## 3. The judgment checks — what the walk cannot see

- **Criterion ↔ case coverage** (where `docs/tests/` holds cases artifacts): a must
  criterion no case exercises, and a case row exercising a criterion no spec carries,
  are both findings — `test-design`'s script (`cases.mjs check`) decides them
  mechanically; this audit quotes its output.
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
- **Honest blocking, the other half.** A blocked task whose question the spec still
  lists as open is honest — listed as in-flight, not a finding; the script already
  caught the stale ones.
- **The untriaged queue.** Open items in the newest `*-triage` report that no later
  report re-verified and no plan task carries: findings that fell out of the loop
  between triage and routing. A `needs-info` item aging across two triages is the
  same debt, named.
- **Approval honesty.** A `status: approved` spec with no approval trail in Amendments
  is the reverse of the script's draft check — it needs the reading the script will
  not do.

### Scouts — parallel chain walks (§3, a wide tree)

The judgment checks walk feature chains that are independent of each other. A
wide tree may fan §3 out read-only through the `scouts` skill: one scout per
feature chain, each reading its reports in date order for findings that never
closed and recurring classes; the untriaged-queue and approval-honesty checks
stay with the lead (they read the whole tree, not one chain). The mechanical
half never fans out — walk.mjs is already tree-wide and fast. The grant, the
mission charter, and the fan-in rules live in `scouts`. Without a grant the
same checks run sequentially — the findings table's contract does not change.

## 4. Route the findings

Every finding names its owner in the report — the audit ends actionable, not
picturesque:

- spec defects (orphan criteria, desync, status) → amendments through the analyst
  role;
- missing reviews → a qa task (spec-review in a fresh session);
- open and stale findings → the owning plan (dev role) or root-cause for single bugs;
- recurring classes → a CODESTYLE.md anti-pattern proposal for tech-writer.

## 5. Report

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
