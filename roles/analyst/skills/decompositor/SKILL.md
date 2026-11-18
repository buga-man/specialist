---
name: decompositor
description: Turn a system (cross-repository) specification into precise per-repository implementation specs — exact modules, file paths to add or change, repo conventions to follow, repo-side contracts, and tests. Use when a business spec and system analysis exist and the user asks to decompose the work per repository, prepare a repo-level spec, or define exactly what changes in a given repository. Works on the whole spec (repo by repo) or on one named repository. Unlike the upstream skills, this one may include file paths and short illustrative code snippets — but no finished implementation.
---

# Decompositor

Break a system specification down into **per-repository implementation specs**: for each
repo — exactly what changes, where, following the repo's own conventions, and what it
waits from other repos. The system spec says where the system changes; this skill makes
each repo's part concrete enough to plan work from.

The output is still a specification: file paths, patterns, anchoring snippets — not an
implementation.

## Flow

```
1 read both specs → 2 study repo docs → 3 deep recon of the repo → 4 map the changes
                                                                        │
                                                                        ▼
                                                       5 questions (batched) → 6 refine
                                                                        │
                                                                        ▼
                                                    one coherent picture → write the repo spec
```

## 1. Read the specs and choose the scope

- Read the business spec and the system spec. If neither exists, stop: send the task upstream (brainstorm, then system-thinking).
- If the user named a repository, decompose that one. Otherwise take the repos from the system spec, confirm the order (follow its rollout order), and decompose repo by repo.
- One run produces one repository's spec. Never mix repos in a single spec.

## 2. Study the repo's documentation and conventions

- Locate the repo's own docs (README, architecture notes, contribution guides) and how similar features are structured here: layering, naming, where routes, handlers, models, and tests live.
- The system spec's claims about this repo are hypotheses — verify each in code.

## 3. Deep recon of the repo

- Inventory the affected area: existing modules to extend or reuse, and what will be new. "New" is
  a claim, not a default: an entity declared new (function, class, endpoint, role, permission,
  setting, catalog) is searched for first — by concept and synonyms, in the registries. Found → the
  change becomes "extend/reuse X" with its path; not found → the spec records `searched: <what, where>`.
- Take every contract from the system spec that touches this repo and find its counterpart in the code (endpoint, consumer, schema).
- Map the in-repo blast radius: callers, configs, and tests the change touches.
- A wide area splits into scout missions (see Scouts).

## Scouts — parallel deep recon (stages 2–3)

The deep recon splits into independent areas: the repo's docs and conventions, the
inventory of the affected area, contract counterparts, the in-repo blast radius. When the
area is large, offer to dispatch read-only scout subagents and keep the mapping (stage 4)
in the main context:

- **Ask first — always.** One explicit question: may subagent scouts be used, and how
  many? Name the missions and the recommended count; the granted number is the hard
  budget for the run — need more, ask again.
- **Denied, or the host has no subagent mechanism** → run the same missions yourself,
  sequentially, in narrow passes.
- **One mission per scout**: "find the counterpart of contract X", "inventory how `<area>`
  is structured", "who consumes module Y". The `searched:` evidence for anything declared
  new is collected with the same rigor whether by you or by a scout.
- **Report contract**: citable facts with `file:line`; reuse/extend candidates explicit;
  uncertainties as their own list. No prose retelling.
- Scout findings are hypotheses until verified: every change still cites its source, and a
  scout's word counts as `[found]` only after your check in the main context. Scouts read —
  never edit.

## 4. Map the changes

- Per change: what and why, where — concrete file paths and modules to add or modify, following the repo's conventions. A change that carries a business criterion names its `Verify:` — the command that decides it, or an honest manual check; spec-review runs or inspects exactly that.
- Add short illustrative snippets where they pin down intent: a signature, a data shape, a reference to the existing pattern to imitate. When a behaviour is subtle (edge cases, ordering, error shapes), pin the change with a 2-3 row example table (input → expected outcome) — examples are the contract the implementer cannot misread.
- Note the tests this repo will need, in its conventions.
- Include the repo's own docs the change invalidates (README, architecture notes, guides) — updating them is part of the change and becomes ordinary plan tasks, not an afterthought.
- Note ordering: which other repos' changes this one waits for.

## 5. Ask the human

- Batch questions in one message, most critical first (≤10 per round; two rounds is the normal maximum); ask only what would change the spec.
- Repo-level specifics (placement, conventions, edge cases) are fair game. 
- **Hard rule**: if reality in this repo contradicts the system spec — a contract does not fit, an existing behavior must change, a cross-repo decision looks wrong — stop and raise it. This skill never revises contracts or cross-repo decisions locally; the system spec is updated first.

## 6. Write the spec — only when everything forms one picture

- If a blocking question is unanswered, say exactly what is missing and stop.
- Save as `docs/specs/YYYY-MM-DD-<topic>-<repo-name>.md` next to the other specs of this topic; cross-link business, system, and repo specs.
- This skill ends with the approved repo spec. Task planning and coding are separate work.

## Spec format

```markdown
---
id: <topic>-<repo>         # unique artifact id — follow the sibling docs' convention
parent: <system-spec-id>   # for a multi-page system spec: the package README's id
children: []               # plans — appended by implementation-plan
depends-on: []             # sibling specs this one waits for: <id>#<section> — each with a one-line reason
status: draft              # draft / approved
last-updated: YYYY-MM-DD
---

# <Topic> — <repo-name> implementation spec

- Date: YYYY-MM-DD
- Status: draft / approved
- Business spec: <link> · System spec: <link>
- Repository: <name>
- Ambiguity policy: what the implementer does on an ambiguity the specs do not cover —
  halt and ask (the default), or skip and report; silence is not an option

## 1. Role in the feature
What this repo contributes and receives; existing modules and patterns
this builds on (referenced, not guessed).
Business criteria covered: which business-spec acceptance criteria this
repo's changes serve — the semantic traceability spec-review verifies against.

## 2. Changes
Per change: what and why (source: [system spec §N] / [found] / [assumption: why] / [answer #N]),
where — file paths and modules to add or modify, and the pattern to follow.
Each change is reuse / extend / new; `new` carries its `searched:` evidence.
Short illustrative snippets where they pin down intent.
A change serving a business criterion carries `Verify:` (command → expected, or "manual — what is observed").

## 3. Repo-side contracts
Each contract from the system spec as seen from this repo: what it
implements or consumes, key semantics.

## 4. Tests
What to test and how this repo tests (frameworks, locations, conventions).

## 5. Order and dependencies
Which other repos' changes this waits for; what waits for this repo.

## 6. Open questions
| # | Question | Working assumption | Risk if wrong | Blocking |

## 7. Decisions and rationale

## 8. Amendments
Append-only log of approved changes to this spec (a spec may change — never silently):
- YYYY-MM-DD: <what and why> (approved by <user>, source: <task or ruling>)
```

## Rules

- **One spec per repository**; a multi-repo topic is a set of specs, not one.
- **Snippets are anchors, not implementations**: signatures, shapes, references to existing code to imitate. If you can paste in a finished function, you have gone too far.
- **Stay inside the repo**: contracts, cross-repo behavior, and rollout belong to the system spec. Contradictions are raised, never resolved locally.
- **Traceability**: every change cites its source (`[system spec §N]`, `[found]`, `[answer #N]`).
- **Metadata is two-way**: when sibling docs carry YAML frontmatter, the repo spec gets it
  too (copy their field set). Creating it is **two edits** — set its `parent` and append
  its `id` to the system spec's `children` (for a multi-page system spec, the package
  README's); a parent with downstream docs and an empty `children` is a traceability defect.
- Write the spec in the team's working language, which may differ from the language of this skill.
