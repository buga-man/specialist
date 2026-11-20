# Subagents as a feature — audit and design (0.38.0 proposal)

Origin: a full-repo audit on 2026-11-20 (all 24 skills, docs, scripts, hooks, plugins,
extensions). The lead read the five carrier files in the main context; four read-only
scouts swept the remaining skills and docs, and every load-bearing claim of their reports
was re-verified against the files before it entered this doc — the pattern this proposal
formalizes, demonstrated on the audit itself.

Status: **proposal**. Two decisions are open (§7) — the release scope and the consent
memory mechanics. Nothing here is implemented yet.

## 1. What exists — the inventory

The doctrine is already stated centrally at `docs/skills.md` ("Scouts by explicit
permission": ask *may scouts be used, and how many*; the granted count is the hard
budget; without subagents the same missions run sequentially). Five places carry it:

| Carrier | Where | Specifics beyond the common core |
|---|---|---|
| brainstorm | Scouts, stages 2–3 | missions = docs corpus / subsystem per scout |
| decompositor | Scouts, stages 2–3 | `searched:` evidence gathered by a scout under the same rigor |
| system-thinking | Scouts, stage 3 | one scout per repo; `[found]` tags survive delegation — traceability does not break |
| bug-hunt | Parallel hunters | plain-vs-scouts question; iteration budget (≤3); **fresh scouts every iteration** (inherited arguments anchor the new eyes); coordinator dedups by scenario; disagreements resolved by building the scenario, never by vote |
| dispatch | §2, option 3 | "a subagent with the role": a ready role-entry prompt; "No answer means option 4" |

Supporting rules elsewhere: role-qa — "when a subagent helps, it receives the artifacts,
not the conversation"; the review-mode question's origin is recorded in
`docs/review-discipline.md` ("Third delta"); the 2026-11-19 quality report ran the real
precedent (two Explore scouts on the source pack, the lead on the diff).

The common core of the three recon sections (near-verbatim copies of each other):
ask-first in one question (may + how many) → the granted number is the hard budget,
need more — ask again → denied or unsupported host → the same missions sequentially,
report contract unchanged → one mission per scout, never "look at the repo" → report
contract: citable facts with `file:line`, uncertainties as their own list → the prompt
is cleaned of secrets and personal data → scout findings are hypotheses until verified
in the main context → scouts read, never edit.

This is a mature doctrine. The problem is its form, not its content.

## 2. Findings

**P1 — against the idea of explicit consent itself:**

1. **The doctrine is copy-pasted ×4.** The three recon sections are near-identical,
   bug-hunt is a variation. This is exactly the disease `scripts/roles.mjs` was built
   to cure ("no second list to drift"): a rule change is now five edits plus docs plus
   README. With the doctrine about to grow, this is the blocker.
2. **Consent is conditional.** Every carrier asks only "when the surface is large" /
   "a wide area" / "a large or risky target" — the threshold is defined nowhere; the
   agent decides whether to ask at all. Explicit consent is de facto left to the
   executor's judgment.
3. **No "no answer = no" and no memory of permission.** dispatch has the no-answer
   default; the scouts sections do not. And one pipeline pass (brainstorm →
   system-thinking → decompositor) asks the same user the same question three times.
   "The hard budget for the run" — but "run" is never defined.

**P2:**

4. **bug-hunt is the only carrier without prompt sanitization.** The three recon
   skills carry "what leaves for a scout is cleaned of secrets and personal data";
   the parallel-hunters section does not (its secrets line is about the report, not
   the prompt). The hunters get the most security-sensitive targets of all.
5. **`docs/skills.md` role table, qa row is stale:** omits `test-analysis`,
   `test-design`, `defect-triage` (the role tree has all ten).
6. **A hardcoded count:** `docs/skills.md` bug-hunt section pins "2–3 independent
   hunters" — the only place a subagent count is a number instead of a question.

**P3 (side findings, fix in passing):**

7. `defect-triage` description references a nonexistent `issue-review` skill
   (echoed into skill-index).
8. Role descriptions lag their cycles: role-analyst omits `trace-audit`, role-qa
   omits its three new skills, role-dev never names `change-impact`.
9. `kb-index` SKILL.md gate-hosts list names no ZCode.
10. dispatch's frontmatter description omits the "role subagent" option its own §2
    offers (skill-index is generated from that description).

## 3. The fan-out map — where subagents belong

The strongest candidates, by the skills' own structure (all read-only):

| Skill | Stage | Why independent | What stays central |
|---|---|---|---|
| defect-triage | step 3, per-item verify @ SHA | every item is its own revision-scoped check (`merge-base --is-ancestor`, `git log -S`) | dedupe by trigger scenario (pairwise, before/after); aging/recurring over the whole queue |
| code-review | churn-ordered deep reads; re-verification of the prior report's findings | each hot file / carried finding is its own pass | the cross-file duplication grep; the findings table |
| spec-review | criterion by criterion; the cases spine TEST-ID by TEST-ID | each criterion yields its own evidence-backed verdict | the verdict table; the amendment lifecycle (user approves) |
| trace-audit | §3 judgment checks per feature chain | each chain is its own walk | the mechanical half is already walk.mjs |
| test-analysis | the five axes; the six mining sources | axes and sources are canonically enumerated | the axis-coverage note; criteria dedupe |
| change-impact | the six before-questions | each question has its own evidence method | cross-question correlations; its own "in order" doctrine |
| tech-writer, codestyle, bootstrap | drift candidates; the 15–25 file sample; survey probes | independent read-only items | the aggregated report |

**Anti-fan-out — the boundary of the feature, recorded so it never erodes the
doctrine:**

- spec-implementation: "One task at a time, in plan order" — plan tasks are never
  fanned out, no matter how independent they look;
- stand-acceptance: "One charter per session" — and the stand itself is shared
  mutable state (one logged-in session, one rebuild);
- lazy: "do not re-verify what a passing test has already proven" — fan-out must
  not manufacture re-verification;
- everything mutating (fixes, spec edits, commits) — scouts are read-only, always;
- the repo's own precedent that naive parallelism corrupts work is already written
  down (edit-guard: "prettier --write racing eslint --fix … is a corrupted fix at
  best" — deterministic order, no short-circuit).

## 4. The design — a `scouts` skill

One shared skill (the 25th; beside dispatch and bootstrap, mirrored into all three
role plugins — pluginCount unchanged) takes the doctrine out of four copies into one
place, on the roles.mjs principle.

- **Consent gate — one question, unconditional.** The "when the surface is large"
  condition stops gating the *asking*; it scales the *recommendation* instead (a
  small surface recommends solo). No answer means no subagents — dispatch's rule,
  extended here.
- **The count is the subscription.** The second half of the same question; the
  granted number is the hard budget for simultaneous scouts; "need more — ask
  again". Iteration loops (review→fix→review) carry their own count, and every
  iteration runs fresh scouts with no inherited context.
- **Optional pin in `.spec-gate`** (`scouts: <n>`): subscriptions change rarely; the
  key replaces the question (the role-pin pattern). No key — the question is asked.
- **Permission lives in the session.** Granted once at the first fan-out opportunity
  of a session, it covers every skill in that session; a fresh session, or an
  explicit change by the user, re-asks. No state file beyond the optional pin.
- **Mission charter.** One mission per scout, shaped like a stand-acceptance charter
  (mission, scope boundary), never "look at the repo".
- **Prompt hygiene.** Sanitized of secrets and personal data (closes the bug-hunt
  gap automatically); artifacts, not conversation (role-qa's rule).
- **Fan-in without quality loss.** Scout reports are hypotheses: load-bearing claims
  are re-verified in the main context before they drive a decision; dedupe by
  scenario/claim, disagreement resolved by building the case out, never by vote; an
  empty pass is written empty; critical findings surface immediately, not at merge.
- **Fallback.** Denied, unsupported host, or no answer → the same missions run
  sequentially, the report contract unchanged. The doctrine is host-agnostic by
  construction (works where there is no question tool: the question is chat text,
  silence means solo).
- **Read-only, always.** Scouts read — never edit. Judgment stays in the main
  context; scouts supply material, not conclusions.
- **No recursion.** A scout never dispatches scouts — the budget lives with the
  lead. A worker-spawned helper or reviewer is a duplicate seat, not extra
  assurance (superpowers: every reviewer a worker spawned duplicated the task
  review the controller dispatched anyway).
- **Prompts reference, they do not paste.** The mission charter carries artifact
  paths, not their contents, and the scout returns conclusions plus a pointer to
  its report, not a dump — everything pasted into a dispatch stays resident in
  the lead's context for the rest of the session (superpowers: a real dispatch
  hit 42k chars, 99% of it pasted history).
- **Never pre-judge a scout.** The mission states what to look for, never what
  to conclude — a "don't flag X" or an "at most minor" in the prompt defeats the
  fresh eyes the scout was dispatched for (superpowers' reviewer rule).
- **A silent scout is chased, not assumed empty.** A scout that never reported
  is a coordinator finding; an empty pass is written empty only after the scout
  actually returned (superpowers' bounded-wait doctrine, adapted to prose).
- **Distinct missions by assignment.** The lead assigns each scout its focus —
  parallel agents do not self-differentiate; overlapping missions are a
  coordinator defect, not redundancy (ECC/disler: uniqueness via assignment).
- **Where the host allows a per-subagent model:** mechanical recon takes the
  cheap tier, judgment stays with the lead, and the model is named explicitly —
  an omitted model silently inherits the session's most expensive one; turn
  count beats token price (superpowers). Hosts without the knob ignore the line.

Consumers keep a short section — "Scouts — dispatch the `scouts` skill" — plus their
specifics: bug-hunt keeps iterations and coordinator dedup; the recon skills keep
their mission splits; new consumers add their independence tables (§3).

## 5. Not adopted (and why)

| Candidate | Reason |
|---|---|
| A `scout-gate` hook blocking the Task/Agent tool without recorded consent | Hooks are stateless between calls and absent as a PreToolUse model on Codex/pi; the question plus the no-answer default gives the same guarantee with no new entity to keep honest |
| A cross-session permission file (beyond the `.spec-gate` pin) | A second source of truth for what the session already remembers; the pin covers the only case worth persisting (a stable subscription) |
| Fanning out plan tasks / stand checks / fixes | §3's anti-fan-out list — the doctrine lines those skills already carry |
| Unconditional parallel dispatch — ECC's "ALWAYS use parallel Task execution", deep-research's "just research it" defaults | The consent question IS the feature; both sources dispatch by default and neither asks |
| Parallel implementers / subagent-driven writing (superpowers SDD, ECC/disler waves) | Even superpowers serializes its implementers ("never dispatch multiple implementation subagents in parallel — conflicts"); spec-implementation's one-task-at-a-time stands. What SDD actually parallelizes is context freshness — which implementation-plan already has ("a task executable by a fresh agent holding only that task") |
| The SDD ledger file (progress.md per plan workspace) | The plan file with its `- Done:` markers is already the state that survives a compact; a second ledger duplicates it |
| dmux/tmux-pane orchestration (ECC dmux-workflows) | An external tool dependency; the doctrine stays host-agnostic |
| "Rulings, not stalls" continuous execution (superpowers) | The stop-and-ask gates are deliberate; their four-stop list (irreversible, security, outward, plan-broken) matches ours already |
| Infinite waves "until context is exhausted" (ECC/disler) | The budget is the user's grant, not the context limit |

Survey provenance (2026-11-20): github.com/obra/superpowers — `dispatching-parallel-agents`
(no consent question at all — the contrast that keeps ours the point), `subagent-driven-development`
(the no-recursion contract, file-based briefs/reports, never-pre-judge, bounded waiting, model
tiering; its reviewer-per-artifact loops for specs and plan chunks are the working precedent for
wave 2), the document-review-system design; github.com/affaan-m/ECC — re-surveyed with the
subagent lens after the 0.32/0.37 mining (autonomous-loops' two-prompt orchestrator and
assignment-based uniqueness; dmux-workflows; the always-parallel rules — rejected above).

## 6. Consumers and migration

- **Wave 1 (always in scope):** brainstorm, decompositor, system-thinking, bug-hunt,
  dispatch — their copied sections become references to `scouts` plus specifics.
- **Wave 2 (scope decision, §7):** defect-triage, code-review, spec-review,
  trace-audit, test-analysis gain fan-out sections.
- **Wave 3 (scope decision, §7):** change-impact, tech-writer, codestyle, bootstrap;
  anti-fan-out boundaries restated inside the touched skills.
- The P2/P3 findings (§2) close with the same release regardless of scope.

## 7. Open decisions

1. **Scope.** A — core only (skill + wave 1 + docs + findings). B — A plus wave 2
   *(recommended: the feature must be visible beyond the recon skills, and the wave-2
   skills already carry all the quality mechanics fan-out needs)*. C — B plus wave 3.
2. **Consent memory.** Session-scoped permission plus the optional `.spec-gate` pin
   *(recommended)*; or session-only (no pin); or config-only (no on-the-spot asking).

## 8. Definition of done

The `scouts` skill; the consumer edits per the chosen scope; `scripts/roles.mjs`
(shared — tests expect 25); the compliance run; `docs/skills.md` — a central scouts
section replacing the current principle line, the stale qa row fixed, the hardcoded
count removed; README (25 skills, the table row); the P3 side findings; all five
version places → 0.38.0; mirrors via `copy-skills.sh --role`; release: merge to main,
tag the tip.
