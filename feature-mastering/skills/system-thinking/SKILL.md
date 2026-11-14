---
name: system-thinking
description: Turn an approved business specification into an implementation specification — which repositories change, which contracts connect them, what breaks. Use when a spec or requirements exist and the user asks how to implement them, asks for system analysis or a repo-by-repo work breakdown, or wants API contracts defined. Analysis is critical: verify the spec against docs and code, hunt for work it never mentions (frontend, migrations, compatibility), and always discuss architectural or behavior-affecting decisions with the user before writing them down. The output contains no code.
---

# System thinking

Turn a business specification into an **implementation specification**: which repositories
change, what changes in each, which contracts connect them, and what breaks. Act as an
experienced systems analyst — assume the spec is incomplete, verify everything in code,
and keep every architectural decision explicit.

The spec answers **where and how the system changes**: repositories, subsystems, contracts,
rollout order. It still contains no code.

## Flow

```
1 read the spec → 2 study docs → 3 recon all repos → 4 critical analysis
                                                            │
                                                            ▼
                                          5 questions (batched) ◄── architecture or behavior
                                                            │         changes: always discussed
                                                            ▼
                                              6 one coherent picture → write the spec
```

Move through the stages in order. Never ask the human what you can find out in the code.

## 1. Read the spec

- Read the whole business spec. Its Open questions are your lead list — resolving them is part of this work.
- If the input is a raw task without a business spec, stop: run the brainstorm skill first.

## 2. Study documentation and code

- Locate documentation for the affected area, in the docs repo and inside code repos.
- Treat the spec's claims as hypotheses, not ground truth: verify each in code before trusting it.

## 3. Recon every repository the change touches

- Enumerate **all** repos that must change. A "backend task" often needs frontend changes and
  vice versa; a data model change ripples into API, UI, migrations, and docs. Hunt for the
  work the spec did not mention — finding it is this skill's main value — and for the work it
  duplicates: what the spec orders built new may already exist as another repo's service,
  endpoint, or job. Found → reuse becomes a contract, not a new build.
- For each repo: what exists today in the affected area, where the change lands, and its
  **blast radius** — who else consumes the modules, endpoints, and schemas being touched.
  Follow dependencies in both directions: upstream callers and downstream dependencies.

## 4. Critical analysis

- Walk the spec requirement by requirement and map each to concrete changes; anything unmapped is a gap.
- Walk the surfaces the spec usually forgets: user-facing UI/UX, permissions and security,
  data migration and backward compatibility, failure modes, observability and operations, performance.
- Mark every statement with its source: `[spec]` — stated in the spec, `[found]` — discovered
  in code or docs, `[assumption]` — your inference.

## 5. Ask the human

- Questions are welcome here — batch them in one message, most critical first (≤10 per round).
- Ask only what would change the result; for the rest, propose an assumption to confirm.
- **Hard rule**: if a change alters existing behavior, breaks a contract, or requires a
  non-trivial architectural decision, stop and discuss it with the user. Present the
  alternatives with trade-offs and your recommendation. Architecture and behavior changes
  are always explicit decisions — never silent defaults, never buried in Open questions.

## 6. Write the spec — only when everything forms one picture

- If a decision is still open and it blocks the design, the spec is not ready: say exactly what is missing.
- Save as `docs/specs/YYYY-MM-DD-<topic>-implementation.md` next to the business spec; cross-link them.
- This skill ends with the approved implementation spec. Planning and coding are separate work.

## Spec format

```markdown
---
id: <topic>                # unique artifact id — follow the sibling docs' convention
parent: <business-spec-id>
children: []               # repo specs — appended by decompositor
status: draft              # draft / approved
last-updated: YYYY-MM-DD
---

# <Topic> — implementation specification

- Date: YYYY-MM-DD
- Status: draft / approved
- Business spec: <link>
- Repositories affected: <list>

## 1. System view
How the change maps onto the system: the repos and subsystems involved and why.
A diagram of interactions, before → after where helpful.

## 2. Changes by repository
### <repo-name>
- <change> — what changes and why, traced to its source: [spec] / [found] / [answer #N]

## 3. Contracts
Contracts crossing repo boundaries (API endpoints, events, schemas) — meaning, not code:
- <contract>: parties, purpose, key semantics, error behavior
- Compatibility: what breaks for existing consumers, migration notes

## 4. Impact and risks
- Behavior changes visible to users or consumers — each listed explicitly with its approved decision
- Blast radius: what else depends on the changed pieces
- Rollout and migration order across repositories

## 5. Open questions
| # | Question | Working assumption | Risk if wrong |

## 6. Decisions and rationale
Architectural decisions — each discussed with the user — and the alternatives rejected.

## 7. Amendments
Append-only log of approved changes to this spec (a spec may change — never silently):
- YYYY-MM-DD: <what and why> (approved by <user>, source: <task or ruling>)
```

## Rules

- **No code**: contracts, boundaries, and data semantics — not implementations. Contract-level field lists are fine when they carry meaning.
- **Architecture and behavior changes are always explicit**: discussed with the user and listed in Impact, never slipped into a changes list.
- **Traceability**: every change cites its source (`[spec]`, `[found]`, `[answer]`); a change with no source is a new decision — surface it as such.
- **Metadata is two-way**: when sibling docs in the target repo carry YAML frontmatter, the new spec gets it too (copy the field set from the siblings; minimum `id`/`parent`/`children`/`status`/`last-updated`). Creating the spec is **two edits**: set its `parent` and append its `id` to the business spec's `children` — a parent with downstream docs and an empty `children` is a traceability defect. If the system spec is a package of pages, the package README aggregates `children` (its pages + repo specs) while each page's `parent` points at the package. Bump `last-updated` on every later edit.
- **Cross-repo order matters**: state rollout and migration dependencies explicitly.
- Write the spec in the team's working language, which may differ from the language of this skill.
