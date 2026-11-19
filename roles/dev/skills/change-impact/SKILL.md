---
name: change-impact
description: Use when a nontrivial edit needs its blast radius assessed before it starts (what the change will touch) or, after it, the actual diff checked against the promised scope; full system specification is system-thinking, code quality is code-review.
---

# Change impact

Two passes around a nontrivial edit: measure the blast radius before the change starts,
align the actual diff with the promised scope after. Assessment only — the skill edits
nothing; its output is a list and a check, the edit itself belongs to the executing skill.

## Flow

```
before → six questions in order (code · data · interfaces · tests · docs · release) → the before-list
the edit happens — in whatever skill owns it (spec-implementation, root-cause, a direct order)
after → the actual diff vs the promised scope · every before-item closed or marked "not needed"
```

## Before the change — six questions, in order

Each answer lands in one written list — the before-list. A question with nothing to touch
gets an explicit "not touched", not silence.

1. **Code** — which modules the change really touches. Prove it by imports and call
   sites, not directory names.
2. **Data** — formats, schemas, migrations. Does old data still load and behave after
   the change.
3. **Interfaces** — contracts outward and inward (API, events, CLI, exports). Grep who
   else reads each.
4. **Tests** — which tests cover the touched paths; which will start lying once the
   change lands.
5. **Docs** — which documents describe the behavior being changed.
6. **Release** — how it rolls out and rolls back; what breaks in the transition window.

## After the change — alignment

- Reread the actual diff — against the base, hunk by hunk, not from memory. The promised
  scope: a plan task's `- Files:` line when a plan is open; otherwise the scope stated
  in the request.
- Everything outside the scope — justify explicitly or revert. "It was nearby" is not
  a justification.
- Walk the before-list: every item either got its change or is marked "not needed" —
  an item silently gone from the check is a finding.
- Report: out-of-scope findings first (each with its justification or its revert), then
  the closed before-list.

## Nuances

- Nontrivial is reach, not size — a two-line edit in a shared helper is nontrivial; a
  new leaf file is not. Fast-lane-sized work skips this skill.
- Evidence, not impressions — every module in the blast radius carries its import or
  call site; every doc in the list carries its path.
- A test that will fail after the change is loud and cheap; a test that will lie — still
  green, asserting yesterday's subject — is the dangerous one. Name both.
- The before-list lives where the change's paper trail already lives — the plan task,
  the report — never a side channel.

## Boundaries

- **Can do autonomously** — read the repo, trace imports and callers, read the diff,
  write the before-list and the alignment report.
- **Requires confirmation / will not do** — changes no code: assessment, not editing
  (the edit is spec-implementation / root-cause work); cross-repo blast radius —
  system-thinking; the quality of the written code — code-review.

## Next

With the before-list written, the edit runs in its executing skill — `spec-implementation`
for features, `root-cause` for defects. The after-report, with the before-list, becomes
the promised-scope map for `code-review`.
