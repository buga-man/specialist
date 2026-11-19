---
name: implementation-plan
description: Turn a repository specification into an ordered, agent-executable implementation plan — exact files, single-action steps, runnable verification, commit points. Use when the business, system, and repository specs exist and the user asks to plan the implementation, break the repo spec into tasks, or prepare a work plan for an agent. The plan makes no new decisions — it arranges the work the specs already decided, and every task is executable by a fresh agent holding only that task and the repo spec.
---

# Implementation plan

Turn the repository spec into an **ordered set of agent-executable tasks**: exact files,
single-action steps, runnable verification, commit points. The specs made the decisions;
the plan only arranges the work.

The plan is written for an executor with fresh context: the task plus the repo spec must
be all it needs. Written plans survive session boundaries and context compaction — plans
in a head do not. The plan also outlives its session: the next agent — or this one after
a compact — resumes from the file alone, so task status, the next step, and open
questions live in the plan, never in conversation.

## Flow

```
1 read the specs → 2 map changes to tasks → 3 order, slice, right-size → 4 write the plan → 5 self-review
                                                      │
                                              blocking gap? → raise it, never invent around it
```

## 1. Read the specs

- The repo spec is the source of record: its Changes section is the entire task universe. The system spec supplies contracts and rollout order; the business spec supplies intent and acceptance criteria.
- No repo spec → stop: run decompositor first (the analyst role; if it is not installed, ask the user for the spec rather than sketching one yourself).
- An existing plan for this topic with unchecked tasks → stop and ask the user; never overwrite work that may be mid-build.

## 2. Map changes to tasks

- Every repo-spec change maps to one or more tasks; every task cites its change (`[repo spec §N]`). A task with no source is scope creep — cut it or raise it.
- Slice vertically where the code allows: a task delivers a working, verifiable path (data + logic + entry point), not a whole layer.

## 3. Order, slice, right-size

- Order by dependency and the system spec's rollout; the repo should build and its tests pass after every task. High-risk work goes early.
- Size: one task = one coherent change across ~1–5 files. Bigger → split. A title containing "and" is two tasks. A task whose verification depends on a later task is ordered wrong.
- When the repo spec defines tests for a change, they belong to the task: prefer running the test first (red) and making it pass (green), where the repo's conventions support it.

## 4. Write the plan

- Save as `docs/plans/YYYY-MM-DD-<topic>-<repo>.md` next to the specs; cross-link all three.
- Work lands on a feature branch: the plan names it on the `- Branch:` line (the repo's
  own convention when it has one, else `feat/<topic>-<repo>`); the executor creates the
  branch from the base **before Task 1** and every task commit lands on it. One branch
  per plan is what makes acceptance cheap: spec-review diffs the branch against its base
  instead of hunting commits across the history. A plan marked risky (shared core, data,
  security) goes one step further — a dedicated worktree (`git worktree add`), so the
  main checkout stays on `main` while the risky work runs isolated.
- Per task, use the format below. Steps are single, concrete actions. Verify holds exact commands and their exact expected results. Commit holds the message; one task = one commit.
- List every file the task will touch on the Files line, in backticks, on one line — the spec-gate hook enforces exactly that scope during implementation. Globs are allowed when a task genuinely spans many files (`src/**/*.css`); prefer exact paths.
- Optional per-task lines, when they earn their place: `- Risk:` (what makes this task risky — supports the ordering rule and gives spec-review something to audit), `- Revert:` (the one-line undo: flag flip, revert, migration-down), `- Criteria:` (which business acceptance criteria this task serves), `- Verify (red):` (tests-first tasks — the exact command showing the failure the unimplemented feature must produce; a red test that cannot fail checks nothing, and the task's `Verify:` then flips it green). The spec-gate hook ignores every line it does not parse — these are for the executor and the reviewer.
- Plans of more than one task — or with any risky task — end with two plan-level sections, written after the last task (the gate reads `## ...` headers as task boundaries, so plan-level sections must not sit between tasks): `## Revert` — the per-task undos in reverse execution order plus one post-rollback verify command — and a final full-suite task (`### Task N: full suite green`, `Verify: <full test command> → exit 0, no previously-passing test regressed`). Per-task `Verify:` commands alone do not guarantee the whole suite is green.
- Leave closure to the executor: a task is closed by a `- Done: <commit hash>` line in its section. Checkbox ticks (`- [x]`) are progress notes — the gate ignores them for closure. **Never put a `- Done:` line in the plan you write** — the gate reads any Done marker as closure, so a template line would close every task before work starts.
- When two tasks share an interface, name it in both (what one produces, the other consumes).
- Small implementation choices are made by repo conventions: `CODESTYLE.md` in the repo root when present; when it is absent, note in the plan that conventions are not formalized. When neither applies, pick the simplest and say so inside the task.

## 5. Self-review, then hand off

- Coverage: every repo-spec change is mapped; every task has a source.
- Executability: every task has Files, single-action steps, runnable Verify, Commit; no step says "implement the feature".
- Authority: no task requires a decision the specs do not make. If one surfaces, stop and raise it — the plan translates decisions, never invents them.
- Reuse: a task creating something new cites the repo spec's `searched:` evidence; no citation — raise it, the plan does not invent duplicates.
- Ordering: no verification depends on a later task; coupled tasks name their interface.
- Rollback: multi-task plans carry `## Revert` and the full-suite gate task; every task's `Verify (red)` really fails before the implementation exists.
- Proportionality: the plan stays roughly proportional to the repo spec.
- Hand the plan to the user for approval. This skill ends at the approved plan; execution is separate work.

## Plan format

```markdown
---
id: <topic>-<repo>         # unique artifact id — follow the sibling docs' convention
parent: <repo-spec-id>
children: []               # downstream artifacts (reviews…) — appended as created
status: draft              # draft / approved
last-updated: YYYY-MM-DD
---

# <Topic> — implementation plan (<repo-name>)

- Date: YYYY-MM-DD
- Status: draft / approved
- Specs: business <link> · system <link> · repo <link>
- Repository: <name>
- Branch: <feat/<topic>-<repo>> — created before Task 1, one branch (or worktree) for
  the whole plan; spec-review diffs it against the base
- Execution: one task = one commit, in order; each task is executable
  by a fresh agent holding the repo spec and this task alone.
- Ambiguity: on an ambiguity the specs do not cover — halt and ask (the default),
  or skip and report. Silence is not an option.

## Constraints
Verbatim from the specs — only what shapes the code: versions, conventions,
API behavior, security rules.

## Tasks

### Task 1: <outcome in one line>
- Source: [repo spec §N]
- Files: `src/api/export.ts`, `src/api/export.test.ts`
- Do:
  1. <single action>
  2. <single action>
- Interfaces: consumes <…> · produces <…>   (only when coupled to another task)
- Risk: <what makes this task risky>   (optional)
- Revert: <the one-line undo>   (optional)
- Criteria: <business criteria this task serves>   (optional)
- Verify: <exact command> → <expected result>
- Verify (red): <exact command> → <the failure before the feature exists>   (optional, tests-first)
- Commit: <message>
<!-- Do not write a "- Done:" line here: the executor adds it when the task closes,
     and any Done marker already present makes the spec-gate treat the task as closed. -->

### Task 2: ...

## Decision log   (optional — mid-execution decisions, dated, with rationale)
- YYYY-MM-DD: <decision> — <rationale>

## Revert   (optional — plans of more than one task or any risky task)
Undos in reverse execution order, then one post-rollback verify:
- Task 2: <undo> · Task 1: <undo>
- After rollback: <verify command → expected>
```

## Rules

- **Decisions are made upstream**: the plan translates specs into work. Conflicts resolve in favor of the specs; gaps are raised, not filled silently.
- **Every Verify is runnable**: exact command, exact expected result — the executor compares output, not impressions.
- **No placeholders**: "implement the feature" is an anti-pattern; every step is one concrete action.
- **Traceability both ways**: change → tasks and task → change; unmapped work on either side is a defect.
- **Metadata is two-way**: when sibling docs carry YAML frontmatter, the plan gets it too
  (copy their field set); creating it is **two edits** — set its `parent` (the repo spec)
  and append the plan's `id` to that spec's `children`; a parent with downstream docs and
  an empty `children` is a traceability defect.
- **Machine-readable markers**: `### Task`, `- Files:`, `- Done:` — the spec-gate hook parses exactly these (English-only markers; the prose around them is the team's language).
- **A one-task plan is a complete artifact**: for small work it is the whole fast lane — mini-spec in the header, one commit, `- Done:`, spec-review batched later (the qa role; if it is not installed, a fresh review pass before merge); do not inflate it into a full spec chain.
- Write the plan in the team's working language, which may differ from the language of this skill.

## Next

A nontrivial task opens with `change-impact` (the before-list), then runs in
`spec-implementation`; fast-lane-sized work goes straight to `spec-implementation`. The
last task closed there hands the branch to `spec-review`.
