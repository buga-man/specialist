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

Move through the stages in order. **Facts are yours to find** — recon, docs, scouts; **decisions are the user's** — never ask the human what you can find out yourself.

## 1. Read the request

- Restate it in one sentence: desired outcome, for whom, why it matters — what you cannot fill in is your first list of gaps.
- Separate what is explicitly given from what is implied or missing.

## 2. Study the documentation

- Documentation may live in a separate docs repo or scattered across code repos — locate it first; ask for links only if you cannot find it.
- Collect: what the system already does in the affected area, where the new logic will fit, how similar features are described and accepted (terms, conventions, existing criteria).
- A large or scattered corpus makes this stage a scout candidate (see Scouts).

## 3. Recon the system

- Explore the code just enough to map existing capabilities and integration points:
  subsystems, responsibilities, the flows the change touches. Reconnaissance, not
  design — contracts, blast radius, and change placement are system-thinking's job.
- Record findings as citable facts: "the system already does X in subsystem Y".
- Several subsystems to map split cleanly into scout missions (see Scouts).

## Scouts — parallel recon (stages 2–3)

Stages 2 and 3 are independent research areas (a separate docs repo, several
subsystems) — a large surface dispatches the `scouts` skill; the grant, the charters,
and the fan-in rules live there. The specifics: missions are the docs corpus or one
subsystem/flow, never "look at the repo"; the report contract is citable facts with
`file:line`, ready to become spec sources, uncertainties as a separate list — unchanged
whether parallel or sequential (denied, unanswered, or unsupported on the host); and
findings are hypotheses until re-verified in the main context before they feed a
criterion or a question.

## 4. Ask the human

- **Ask the whole frontier.** Recompute it at the start of each round: every question
  whose prerequisites are already settled — askable *now* without guessing at answers
  not yet heard — and ask all of it in one batched message; a question hanging on an
  open answer belongs to a later round.
- Direct questions are a scarce resource: **at most 10 per round**, most critical first.
- Every question is numbered and carries its recommendation, phrased so "yes" accepts it —
  `➡️ recommended: X, because …`. The user answers by number ("1 yes, 2 the second option");
  an open-ended question spends the scarcest resource on reading instead of deciding.
- Ask only questions whose answers would change the spec; each question must name the ambiguity it removes.
- Order what makes the cut by what it moves — **scope > security/privacy > user
  experience > technical detail**. Below the line, and anywhere a reasonable default
  exists, propose the assumption instead — "I assume X — correct me if wrong": a question
  a good default answers is noise wearing a question mark.
- An unknown the spec needs but nobody can answer yet is written into the draft as
  `TBD — needs validation via <how>`, never dressed up as a requirement.
- Questions you did not ask become the spec's Open questions, each with your working assumption.

## 5. Process the answers

- Integrate the answers into scope and criteria — facts found, decisions recorded.
- Recompute the frontier: contradictions and new unknowns may have settled prerequisites —
  one more short round under the same rules; two rounds is the normal maximum, leftovers
  go to Open questions. The interview ends when the frontier is empty: nothing silently
  assumed, every gap resolved or on record with a working assumption.

## 6. Write the spec — only when everything forms one picture

- If it does not, say what is missing and stop — a spec built on resolvable guesses is waste.
- **A genuinely foggy effort is not forced into one spec**: spec the settled part and
  name the fog as decision areas in Open questions — ticket a question when you can
  state it precisely *now*, not when you can answer it; vaguer than that, it stays out
  until it sharpens.
- **A decision that resists prose gets a prototype**: a throwaway artifact the user reacts
  to beats a paragraph they puzzle over. It lives on a throwaway branch, never in the
  spec — the spec records the verdict and links the branch as the decision's primary source.
- **The builder check before saving**: hand the draft to a fresh scout (see Scouts) reading
  it as a builder who cannot ask the author — only "places you would have to guess, and a
  wrong guess would matter" come back, ranked; answer them or convert them to explicit
  assumptions ("a default the reader never heard is one they could not reject").
- Before the criteria are final, run the quality bar (references/ears-patterns.md) over every
  must criterion and walk the set for completeness: every business case is covered by at least
  one criterion, error paths and boundaries (limits, empty, maximum, permission edges) are
  present or explicitly deferred, and no criterion survives the fail test (nothing concrete
  could fail it). 5–15 must criteria is the normal band; over ~20 means
  several features — split with the user. Every must names its **Must-not** —
  the boundary defined alongside the done state ("nothing else changes, no new endpoints,
  no silent retries"): a done criterion without its boundary is a license to overreach.
  The mechanical part of the bar — Verify
  presence on must, unmeasurable wording, the count band — is checked by
  `node "<skill-dir>/scripts/check-criteria.mjs" <spec-path>` before saving; fix what it names.
- **Value-first, above the formal bar**: a formally perfect spec describing the wrong problem
  is worse than a rough spec describing the right one. Two checks before anything else passes:
  - **Problem, not solution** — strip implementation from the summary and criteria; the
    need must stand alone. If the "problem" collapses without the how, it was a solution
    looking for a problem — go back and name the pain.
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
- Assumptions: the defaults chosen where the input was silent — one line each, reviewable.
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
project can use; only concepts unique to this context (a general programming concept
belongs nowhere); rejected synonyms under `Avoid:` at the naming boundaries; written
inline as terms resolve, never in a burst at the end — a glossary is not a running spec.
A criterion built on an undefined term is unverifiable, however well shaped.

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

- **No code in the spec**: no file paths, APIs, data schemas. Business language only;
  domain terms fine, design not.
- **Nothing silently assumed**: anything unresolved is visible in Open questions.
- **Frontmatter is part of the spec**: copy the sibling docs' field set; downstream skills
  append to this spec's `children` — a parent with downstream docs and an empty `children`
  is a traceability defect; fix it when you can see it stale.
- **Every acceptance criterion is verifiable** by a business person — a must criterion
  names its `Verify:` and follows an EARS pattern (references/ears-patterns.md).
- Write the spec in the team's working language, which may differ from the language of this skill.

## Next

The approved spec moves to `system-thinking` — which repositories change, which contracts
connect them, what breaks — and, on a nontrivial feature, through `test-analysis` first
(holes, missed criteria, corner-case axes). Nothing downstream starts from an unaccepted spec.
