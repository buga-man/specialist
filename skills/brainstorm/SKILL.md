---
name: brainstorm
description: Turn a raw task description into a business specification before any planning or implementation. Use whenever a new task, feature request, or change arrives — however briefly it is stated — and when the user asks to brainstorm it, gather requirements, or prepare a spec. Research the request and the existing system, ask the user up to 10 clarifying questions, then produce a business spec with acceptance criteria and business cases. The spec contains no code — only business meaning, rationale, and verifiable criteria. Not for bug reports — root-cause owns those.
---

# Business brainstorm

Turn a raw task into a **business specification** — the foundation for all further work
(system analysis, planning, implementation). Tasks arrive as a few lines that hide most of
the real requirements; this process surfaces them.

The spec answers **what and why**. It never answers how at the code level.

## Flow

```
1 read the request → 2 study docs → 3 recon the system → 4 ask questions (≤10, batched)
                                                                  │
                                                                  ▼
                                                    5 process answers — gaps left?
                                                     │ yes              │ no
                                                     ▼                  │
                                              refine (one more round)   │
                                                     │                  │
                                                     ▼                  ▼
                                              6 one coherent picture → write the spec
```

Move through the stages in order. Never ask the human what you can find out yourself.

## 1. Read the request

- Restate it in one sentence: desired outcome, for whom, why it matters. If you cannot, the things you could not fill in are your first list of gaps.
- Separate what is explicitly given from what is implied or missing.

## 2. Study the documentation

- Documentation may live in a separate docs repo or be scattered across code repos. Locate it first; ask for links only if you cannot find them.
- Collect: what the system already does in the affected area, where the new logic will fit, how similar features are described and accepted (terms, conventions, existing criteria).

## 3. Recon the system

- Explore the code just enough to map existing capabilities and integration points for the new logic: subsystems, their responsibilities, the flows the change touches. This is reconnaissance, not design: findings feed the business description — the technical mapping (contracts, blast radius, change placement) is system-thinking's job, not yours.
- Record findings as citable facts: "the system already does X in subsystem Y".

## 4. Ask the human

- Direct questions are a scarce resource: **maximum 10 total**, batched in one message, most critical first.
- Ask only questions whose answers would change the spec; each question must name the ambiguity it removes.
- If you can responsibly assume, propose the assumption instead of asking: "I assume X — correct me if wrong."
- Questions you did not ask become the spec's Open questions, each with your working assumption.

## 5. Process the answers

- Integrate the answers into scope and criteria.
- If contradictions or new unknowns appeared, run one more short round under the same rules (the 10-question budget is total). Two rounds is the normal maximum; leftovers go to Open questions.

## 6. Write the spec — only when everything forms one picture

- If it does not, say exactly what is missing and stop. A spec built on guesses the user could have resolved is waste.
- Save as `docs/specs/YYYY-MM-DD-<topic>.md` in the main repository of the task; if the location is unclear, ask once.
- After the user approves the spec, this skill is done. Planning and implementation are separate work.

## Spec format

```markdown
---
id: <topic>                # unique artifact id — follow the sibling docs' convention
parent: <id>               # upstream artifact if this spec refines one; else omit
children: []               # downstream specs — appended by system-thinking / decompositor
status: draft              # draft / approved
last-updated: YYYY-MM-DD
---

# <Topic> — business specification

- Date: YYYY-MM-DD
- Status: draft / approved
- Source: <link or reference to the original task>
- Slug: <topic> — every downstream spec, review, and plan of this feature carries it
  verbatim: YYYY-MM-DD-<topic>[-implementation|-<repo>|-review] in docs/specs/,
  YYYY-MM-DD-<topic>-<repo> in docs/plans/

## 1. Business summary
The problem, the desired outcome, and the value, in business prose. A reader
outside the project must understand what and why from this section alone.

## 2. Scope
- In scope: ...
- Out of scope: ... (explicit, to prevent scope creep)

## 3. Acceptance criteria
Numbered, verifiable statements; a business person can check each one.
Mark every criterion's source: [request], [docs], [answer #N].
1. ...

## 4. Business cases
Only cases that are genuinely distinct (happy path + key alternatives and failures),
each as an actor → action → outcome sequence.

### Case: <name>
1. ...

## 5. Open questions
| # | Question | Working assumption | Risk if the assumption is wrong |

## 6. Decisions and rationale
Key business decisions made during brainstorming and why alternatives were rejected.

## 7. Amendments
Append-only log of approved changes to this spec (a spec may change — never silently):
- YYYY-MM-DD: <what and why> (approved by <user>, source: <task or ruling>)
```

## Rules

- **No code in the spec**: no file paths, APIs, data schemas, implementation details. Business language only — ideas, rationale, outcomes. Domain terms are fine; design is not.
- **Nothing silently assumed**: anything unresolved is visible in Open questions.
- **Frontmatter is part of the spec**: when sibling docs in the target repo carry YAML metadata, include it (copy the field set from the siblings; minimum `id`/`parent`/`children`/`status`/`last-updated`). Downstream skills append to this spec's `children` — if you can already see it stale, fix it.
- **Every acceptance criterion is verifiable** by a business person, not only by a developer.
- Write the spec in the team's working language, which may differ from the language of this skill.
