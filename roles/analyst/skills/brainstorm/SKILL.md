---
name: brainstorm
description: Turn a raw task description into a business specification before any planning or implementation. Use whenever a new task, feature request, or change arrives — however briefly it is stated — and when the user asks to brainstorm it, gather requirements, or prepare a spec. Research the request and the existing system, ask the user up to 10 clarifying questions per round (two rounds at most), then produce a business spec with acceptance criteria and business cases. The spec contains no code — only business meaning, rationale, and verifiable criteria. Not for bug reports — root-cause owns those.
---

# Business brainstorm

Turn a raw task into a **business specification** — the foundation for all further work
(system analysis, planning, implementation). Tasks arrive as a few lines that hide most of
the real requirements; this process surfaces them.

The spec answers **what and why**. It never answers how at the code level.

## Flow

```
1 read the request → 2 study docs → 3 recon the system → 4 ask the frontier (≤10, batched)
→ 5 process answers — gaps left? one refine round → 6 one coherent picture → write the spec
```

Move through the stages in order. **Facts are yours to find** — recon, docs, scouts; **decisions are the user's** — a question is spent only when the answer is a decision only they can make. Never ask the human what you can find out yourself.

## 1. Read the request

- Restate it in one sentence: desired outcome, for whom, why it matters. If you cannot, the things you could not fill in are your first list of gaps.
- Separate what is explicitly given from what is implied or missing.

## 2. Study the documentation

- Documentation may live in a separate docs repo or be scattered across code repos. Locate it first; ask for links only if you cannot find them.
- Collect: what the system already does in the affected area, where the new logic will fit, how similar features are described and accepted (terms, conventions, existing criteria).
- A large or scattered corpus makes this stage a scout candidate (see Scouts).

## 3. Recon the system

- Explore the code just enough to map existing capabilities and integration points for the new logic: subsystems, their responsibilities, the flows the change touches. This is reconnaissance, not design: findings feed the business description — the technical mapping (contracts, blast radius, change placement) is system-thinking's job, not yours.
- Record findings as citable facts: "the system already does X in subsystem Y".
- Several subsystems to map split cleanly into scout missions (see Scouts).

## Scouts — parallel recon (stages 2–3)

Stages 2 and 3 are independent research areas, and each splits further (a separate docs
repo, several subsystems). When the surface is large, dispatch the `scouts` skill and
keep the main context for judgment, not for reading raw material. The grant (one
question — permission and count), the mission charter, and the fan-in rules live there;
the specifics of this skill:

- Missions here: the documentation corpus, or one subsystem / flow of the code recon —
  never a vague "look at the repo".
- **Report contract**: citable facts, each with a `file:line` or document reference and
  ready to become a spec source; uncertainties and gaps as a separate list. No prose
  retelling. The contract applies unchanged whether the missions ran in parallel or —
  denied, unanswered, or unsupported on the host — sequentially in narrow passes.
- Scout findings are hypotheses until verified: before a fact becomes an acceptance
  criterion or feeds a question, check it in the main context.

## 4. Ask the human

- **Ask the whole frontier.** Recompute it at the start of each round: every question
  whose prerequisites are already settled — askable *now* without guessing at answers
  not yet heard — and ask all of it in one batched message; a question hanging on an
  open answer belongs to a later round.
- Direct questions are a scarce resource: **at most 10 per round**, most critical first.
- Every question carries its recommendation, phrased so "yes" accepts it —
  `➡️ recommended: X, because …`. The user confirms in a word or corrects; an open-ended
  question spends the scarcest resource on reading instead of deciding.
- Ask only questions whose answers would change the spec; each question must name the ambiguity it removes.
- Order what makes the cut by what it moves — **scope > security/privacy > user
  experience > technical detail**. Below the line, and anywhere a reasonable default
  exists, propose the assumption instead — "I assume X — correct me if wrong": a question
  a good default answers is noise wearing a question mark.
- Questions you did not ask become the spec's Open questions, each with your working assumption.

## 5. Process the answers

- Integrate the answers into scope and criteria — facts found, decisions recorded.
- Recompute the frontier: contradictions and new unknowns may have settled prerequisites —
  one more short round under the same rules; two rounds is the normal maximum, leftovers
  go to Open questions. The interview is done when the frontier is empty: nothing left
  silently assumed, every gap resolved or on record with a working assumption.

## 6. Write the spec — only when everything forms one picture

- If it does not, say exactly what is missing and stop. A spec built on guesses the user could have resolved is waste.
- **A genuinely foggy effort is not forced into one spec**: spec the settled part and
  name the fog as decision areas in Open questions — ticket a question when you can
  state it precisely *now*, not when you can answer it; vaguer than that, it stays out
  until it sharpens.
- **A decision that resists prose gets a prototype**: a throwaway artifact the user reacts
  to beats a paragraph they puzzle over. It lives on a throwaway branch, never in the
  spec — the spec records the verdict and links the branch as the decision's primary source.
- Before the criteria are final, run the quality bar (references/ears-patterns.md) over every
  must criterion and walk the set for completeness: every business case is covered by at least
  one criterion, error paths and boundaries (limits, empty, maximum, permission edges) are
  present or explicitly deferred, and no criterion survives the fail test (nothing concrete
  could fail it). 5–15 must criteria is the normal band; more than ~20 means the scope is
  really several features — split it with the user. The mechanical part of the bar — Verify
  presence on must, unmeasurable wording, the count band — is checked by
  `node "<skill-dir>/scripts/check-criteria.mjs" <spec-path>` before saving; fix what it names.
- **Value-first, above the formal bar**: a formally perfect spec describing the wrong problem
  is worse than a rough spec describing the right one. Two checks before anything else passes:
  - **Problem, not solution** — strip every mention of implementation from the summary and
    criteria; the need must still stand on its own. If the "problem" collapses without the
    how, the spec described a solution looking for a problem — go back and name the pain.
  - **No gold-plating** — every criterion traces to the stated value; a criterion beyond
    what the value needs is cost without a customer — cut it or split it into its own feature.
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
- Constraints & dependencies: deadlines, compliance, other teams, budgets — the outer limits the work must respect.

## 3. Acceptance criteria
Numbered, verifiable statements; a business person can check each one.
Mark every criterion's source: [request], [docs], [answer #N].
Mark each must (the feature fails without it) or should (valuable, negotiable) — plans and reviews lean on the difference.
The markers and the Verify label are bilingual — `(обязательно)` carries exactly the weight of `(must)`, the should class is `(should)`/`(желательно)`/`(опционально)`/`(необязательно)`, and `Проверка:` is `Verify:` (the gates read them all; a should-class marker never reads as must).
Shape each criterion with an EARS pattern (references/ears-patterns.md) — a fixed stem:
"When <trigger>, the system shall …" / "While <state>, …" / "If <condition>, … shall not …"
/ a plain always-true property — so a fresh agent parses it without guessing.
Every must criterion carries a `Verify:` — the command that decides it, or an honest
manual check. spec-review runs or inspects exactly that, so the verdict is evidence,
not impression.
1. <EARS-shaped statement> (must) — Verify: <exact command → expected result, or "manual — <who observes what>">
2. ... (should)

## 4. Business cases
Only cases that are genuinely distinct (happy path + key alternatives and failures),
each as an actor → action → outcome sequence. Each case carries a priority tier —
P1 what the value stands on, P2 the important alternatives, P3 the rest — and the
P1 tier alone is a shippable slice: had nothing else landed, the feature would
still be worth merging. Priorities are the plan's slicing order.

### Case: <name> (P1)
1. ...

## 5. Success metrics
How the outcome is measured after release: metric, baseline, target, when measured.
What nobody plans to measure is a wish, not a feature.

## 6. Glossary
Only when domain terms appear in the criteria: term → definition a reader outside the
project can use. A criterion built on an undefined term is unverifiable, however well shaped.

## 7. Open questions
| # | Question | Working assumption | Risk if the assumption is wrong | Blocking |

Blocking = yes means downstream skills must not start before it resolves —
"one coherent picture" is enforced here. More than three blocking rows: the picture
is not one yet — resolve or split with the user (check-criteria flags it).

## 8. Decisions and rationale
Key business decisions made during brainstorming and why alternatives were rejected.

## 9. Amendments
Append-only log of approved changes to this spec (a spec may change — never silently):
- YYYY-MM-DD: <what and why> (approved by <user>, source: <task or ruling>)
A change request against an approved spec is classified by impact before it lands:
wording only → apply as an amendment; touches an acceptance criterion → the user
re-confirms the criterion — never edited silently; contradicts a recorded decision →
a conflict, raised and decided, not resolved in place. While the spec sits with an
external reviewer, edits stop — changes land as amendments after the verdict.
```

## Rules

- **No code in the spec**: no file paths, APIs, data schemas, implementation details. Business language only — ideas, rationale, outcomes. Domain terms are fine; design is not.
- **Nothing silently assumed**: anything unresolved is visible in Open questions.
- **Frontmatter is part of the spec**: when sibling docs carry YAML metadata, include it
  (copy their field set). Downstream skills append to this spec's `children` — a parent
  with downstream docs and an empty `children` is a traceability defect; if you can already
  see it stale, fix it.
- **Every acceptance criterion is verifiable** by a business person — a must criterion
  names its `Verify:` and follows an EARS pattern (references/ears-patterns.md).
- Write the spec in the team's working language, which may differ from the language of this skill.

## Next

The approved spec moves to `system-thinking` — which repositories change, which contracts
connect them, what breaks — and, on a nontrivial feature, through `test-analysis` first
(the qa role's spec-side probe: holes, missed criteria, corner-case axes). Nothing
downstream starts from a spec the user has not accepted.
