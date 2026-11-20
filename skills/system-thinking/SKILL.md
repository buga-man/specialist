---
name: system-thinking
description: Turn an approved business specification into an implementation specification — which repositories change, which contracts connect them, what breaks. Use when a spec or requirements exist and the user asks how to implement them, asks for system analysis or a repo-by-repo work breakdown, or wants API contracts defined. Analysis is critical — verify the spec against docs and code, hunt for work it never mentions (frontend, migrations, compatibility), and always discuss architectural or behavior-affecting decisions with the user before writing them down. The output contains no code.
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

## Scale the ceremony — classify before the stages

Before running the full pipeline, classify the change by **blast radius** — ceremony
scales with it, and a full stage parade on a trivial fix is as harmful as a fast lane
on a cross-repo contract:

- **trivial** — one point, local effect, no contracts → stop here, no implementation
  spec; spec-implementation's fast profile owns such work — the mini-spec in the quick
  plan's header is the change's whole documentation. Reference it, do not reinvent.
- **small** — one repo, local interfaces → shortened pass: the same stages, each run on
  the affected area only; the spec format stays intact.
- **standard** — the full pipeline as written.
- **large / cross-repo** — contracts between repos, migrations, rollout → full pass,
  no fast lane — a shortcut here multiplies across every repo it skipped.

**Fail-closed**: what a step or decision actually touches cannot be determined → mark it
an open question / risk for the user (stage 5); never fit the class to the scheme's
convenience.

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
- More than one repo — or one repo with a wide blast radius — splits into per-repo scout
  missions (see Scouts).

## Scouts — parallel repo recon (stage 3)

Repo recon splits naturally by repository: one read-only scout per repo, identical mission
shape. When the change touches several repos — or one repo with a wide blast radius —
dispatch the `scouts` skill and keep the analysis (stage 4) in the main context. The grant
(one question — permission and count), the mission charter, and the fan-in rules live
there; the specifics of this skill:

- Missions here, per repo: what exists today in the affected area, where the change
  lands, the blast radius (upstream callers, downstream dependencies), and the work the
  spec never mentioned (frontend, migrations, compatibility). An existing service,
  endpoint, or job that could replace a "new build" is called out explicitly.
- **Report contract**: findings tagged `[found]` with `file:line`; reuse candidates and
  unmentioned work as their own lists; uncertainties separately. The tags survive into
  the spec — traceability does not break on delegation. The contract applies unchanged
  whether the missions ran in parallel or — denied, unanswered, or unsupported on the
  host — sequentially.
- Stage 4 stays yours — scouts supply material, not conclusions (the fan-in rules
  of `scouts` apply unchanged).

## 4. Critical analysis

- Walk the spec requirement by requirement and map each to concrete changes; anything unmapped is a gap.
- Walk the surfaces the spec usually forgets: user-facing UI/UX, permissions and security,
  data migration and backward compatibility, failure modes, observability and operations, performance.
- Mark every statement with its source, and be honest about certainty: `[spec]` — stated in
  the spec; `[found]` — verified in code or docs, carrying `file:line` evidence; `[assumption:
  why]` — your inference, carrying the reason; `[ambiguous]` — could not be resolved, must stay
  visible, never blended silently into prose. A risk or impact without evidence is `[ambiguous]`,
  not a fact.

## 5. Ask the human

- Questions are welcome here — batch them in one message, most critical first (≤10 per round; two rounds is the normal maximum, leftovers go to Open questions).
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
depends-on: []             # lateral needs: <sibling-id>#<section> — each with a one-line reason in prose
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
- <change> — what changes and why, traced to its source: [spec] / [found] / [assumption: why] / [answer #N]

## 3. Contracts
Contracts crossing repo boundaries (API endpoints, events, schemas) — meaning, not code.
Each contract is complete or visibly incomplete — a gap in it is an unmade decision
that resurfaces in implementation as the dev role's guess:
- <contract>: parties, purpose, key semantics
- Fields/parameters: name, type, meaning (or a schema reference) — every one named
- Example pair: one request and one successful response, minimal
- Error table: the failure outcomes (code/status/event) and what each means
- Limits: pagination, rate, payload size — or an explicit "no limits"
- Compatibility: what breaks for existing consumers, migration notes; a change to an
  existing contract is classified **breaking** (some consumer breaks — a migration
  plan and the user's decision are mandatory) or **additive** (existing consumers
  unaffected)
- Verified by: the repository that owns the contract test — a contract nobody tests is a wish, not a contract

## 4. Data migration and rollback
- Migration per repo: what changes for stored data, in which order, over which compatibility window.
- Rollback: what reverts what (flag / revert / migration-down) and what is irreversible — irreversibility is part of the approval discussion, never a footnote.

## 5. Impact and risks
- Behavior changes visible to users or consumers — each listed explicitly with its approved decision
- Blast radius: what else depends on the changed pieces
- Observability and operations: what must be visible when this misbehaves — logs, metrics, alerts
- Security and permissions: what the change grants, exposes, or tightens

## 6. Open questions
| # | Question | Working assumption | Risk if wrong | Blocking |

## 7. Decisions and rationale
Architectural decisions — each discussed with the user — recorded as decision records in
a fixed shape: **context → decision → alternatives rejected (with the reason each lost)
→ consequences**. A decision without compared alternatives is not a decision but a
default; it earns its record only when the comparison exists.
Decisions that are hard to reverse (public contracts, schemas, migrations, removals of
existing behavior) are listed as a separate sub-list, each with the date, the rejected
reversible alternative, and the revert cost: these outlive the feature, and every
downstream skill — and tech-writer's audit — reads them first.
Records are **append-only**: a superseded decision is never edited away — a new record
is appended, referencing the one it replaces and naming why; the history of decisions is
itself architecture memory.

## 8. Amendments
Append-only log of approved changes to this spec (a spec may change — never silently):
- YYYY-MM-DD: <what and why> (approved by <user>, source: <task or ruling>)
- An amendment changing an existing contract or public interface carries its
  blast-radius class — breaking / additive — and a breaking one names its migration
  plan; the class is part of the record, not of the conversation
```

## Rules

- **No code**: contracts, boundaries, and data semantics — not implementations. Contract-level field lists are fine when they carry meaning.
- **Architecture and behavior changes are always explicit**: discussed with the user and listed in Impact, never slipped into a changes list.
- **Traceability**: every change cites its source (`[spec]`, `[found]`, `[assumption: why]`, `[answer]`); a change with no source is a new decision — surface it as such. Certainty is part of the citation: `[found]` carries `file:line`, an inference carries its reason, an unresolved point stays `[ambiguous]` and visible.
- **Dependencies are typed**: when this spec needs an output of a sibling spec, record it in `depends-on` (`<id>#<section>`) with a reason — a silent cross-spec need is how integration surprises happen.
- **Metadata is two-way**: when sibling docs carry YAML frontmatter, the new spec gets it
  too (copy their field set). Creating it is **two edits** — set its `parent` (the business
  spec) and append its `id` to that spec's `children`; a parent with downstream docs and
  an empty `children` is a traceability defect.
- **Cross-repo order matters**: state rollout and migration dependencies explicitly.
- Write the spec in the team's working language, which may differ from the language of this skill.

## Next

The approved system spec moves to `decompositor` — one repo spec per repository, each
carrying only its own side of the contracts. The landing order across repositories comes
from this spec's rollout, not from the repo specs.
