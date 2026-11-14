# Skills: what each of the twelve does

A pipeline for the full feature development cycle — from a raw task to code backed by a
spec and up-to-date documentation. Each skill is a separate role with a clear input and
output; the output of the previous stage is the contractual input of the next. Decisions
are made at the top (in the specs) and recorded; at the bottom they are only executed.

```
task → brainstorm → business spec
      business spec → system-thinking → system spec (repos, contracts, rollout)
            system spec → decompositor → repo spec
                  repo spec → implementation-plan → a task plan for an agent
                        plan → spec-implementation → code (tests-first, the spec is the oracle)
                              code → spec-review → acceptance (criterion by criterion)
                                    unverifiable → stand-acceptance (live acceptance on the stand)

after merge / before release → tech-writer → spec audit + user manual

bugs → root-cause → reproduction → root cause → red test → minimal fix

documentation map → kb-index → index + maps (search by the document's "face")

repo conventions → codestyle → CODESTYLE.md (mimicry: agent code is indistinguishable from developer code)
```

`lazy` is not a stage but a behavioral overlay for any coding.

## Principles of the whole system

- **The spec is the oracle.** Priority: spec > test > code. On a mismatch, the code/test
  is fixed, not the spec.
- **Nothing silent.** Deviations during implementation follow three tiers: local — a ruling
  in the report; behavior/contract/scope — a user-approved amendment to the spec (the
  Amendments section); changed intent — back to brainstorm.
- **Evidence, not impressions.** Acceptance verdicts and audit findings cite a test, a place
  in the code, or observed behavior. "Looks fine" is not a verdict.
- **The reviewer does not fix, the writer does not edit silently** — role independence
  matters more than speed.
- **Scouts by explicit permission.** The recon-heavy skills (brainstorm, system-thinking,
  decompositor) may parallelize research with read-only subagent scouts — but only after
  asking the user: may scouts be used here, and how many. The granted count is the hard
  budget; without subagents (denied or unsupported) the same missions run sequentially.
- **Slug navigation.** All artifacts of a feature carry its slug: `docs/specs/YYYY-MM-DD-<topic>*`
  (business spec, `-implementation`, `-<repo>`, `-<repo>-review`) and
  `docs/plans/YYYY-MM-DD-<topic>-<repo>.md`. The whole chain is one glob:
  `ls docs/specs/*<topic>* docs/plans/*<topic>*`.
- Content is written in the team's working language; the skills themselves are in English.

---

## brainstorm — raw task → business spec

**Why:** tasks arrive as three lines hiding half the requirements. The skill surfaces them:
it studies the docs and the system, asks the user at most 10 questions (in one batch, only
those whose answers change the spec), and turns it all into a business spec.

- **Input → output:** raw task → `docs/specs/YYYY-MM-DD-<topic>.md`
- **In the spec:** business meaning without code (no paths, APIs, schemas), scope/non-scope,
  verifiable acceptance criteria (each with a source `[request]/[docs]/[answer #N]`), business
  cases "actor → action → outcome", open questions with working assumptions.
- **When:** any new task/feature; phrases "gather requirements", "make a spec".
- **Not for:** bugs — those belong to root-cause.

## system-thinking — business spec → system spec

**Why:** the main value is finding work the spec is silent about: a frontend for a
"backend task", migrations, compatibility, permissions — and work the spec duplicates:
what was ordered as "new" may already exist in a neighboring repo. Reconnaissance of all
affected repositories, blast radius, contracts between repos, rollout order.

- **Input → output:** business spec → `docs/specs/YYYY-MM-DD-<topic>-implementation.md`
- **Key rule:** architectural decisions and behavior changes are **always** discussed with
  the user explicitly (alternatives + trade-offs + a recommendation) — never slipped in as
  a "default". Every change is traced: `[spec]/[found]/[assumption]`.
- **When:** "system analysis", "how do we implement this", "which repositories are affected".

## decompositor — system spec → repo specs

**Why:** makes each repo concrete: exact modules and files, this repo's patterns, short
anchor snippets (not implementations!), tests in the repo's conventions, where to expect
changes from. It also folds the repo's aging docs into the changes.

- **Input → output:** system spec → one `docs/specs/YYYY-MM-DD-<topic>-<repo>.md` per repository
- **Key rule:** within a repo — allowed; contracts and cross-repo decisions — not allowed:
  contradictions are raised up to system-thinking, not "fixed" locally.
- **New means searched first:** an entity declared new (a function, class, endpoint, role,
  setting) is searched for across the repo first; found — extend/reuse; not found —
  `searched: <what, where>` in the spec. Otherwise a duplicate ordered by the spec will pass
  acceptance as passed.
- **When:** "split by repository", "decomposition", "what changes in this repo".

## implementation-plan — repo spec → a task plan for an agent

**Why:** the plan is written for an executor with fresh context: task + repo spec = all it
needs. Written plans survive session boundaries and compaction — plans in a head do not.

- **Input → output:** repo spec → `docs/plans/YYYY-MM-DD-<topic>-<repo>.md`
- **Task format (machine-readable, parsed by spec-gate):** `### Task N`, `- Files:`
  (paths in backticks, on one line, globs allowed), action steps, `Verify` with the exact
  command and expected result, `Commit`. One task = one commit. The hook reads only
  `### Task`, `- Files:`, and `- Done:` from this (added by the executor on closure) —
  `Verify` and `Commit` are for the executor agent, not the parser.
- **Key rule:** the plan makes no decisions — it lays out decisions already made.
  A hole in the spec → stop and escalate, not "fill it in".
- **When:** "make an implementation plan", "break it into tasks", "work plan".

## spec-implementation — plan → code

**Why:** an executor follows the plan, task by task, tests first. A feature/fix gets a red
test before the code; a refactor gets characterization tests that must stay green. Every
new test is proven by failure: break the behavior — the test turns red on an assert —
restore the behavior — it turns green. A test that was never red verifies nothing.

- **Input → output:** plan → commits (one task = one commit, the task is closed with
  `- Done: <hash>` in the plan)
- **Three tiers of deviations:** local (a different way, same behavior) — a ruling in the
  report; behavior/contract/scope — stop, an amendment to the owning spec after approval;
  changed intent — back to brainstorm.
- **Final report:** decisions the specs did not cover; ambiguous readings (the one place a
  human is genuinely needed); rulings; spec amendments; unproven tests.
- **When:** "implement", "execute the plan", "implement per the spec".

## spec-review — code → acceptance

**Why:** independent acceptance against the specs, criterion by criterion. Best in a fresh
session — the author of the code must not be its reviewer. It starts from "everything is
broken until proven otherwise".

- **Input → output:** specs + diff + executor's report → `docs/specs/YYYY-MM-DD-<topic>-<repo>-review.md`
- **Verdicts:** `passed` (with evidence) / `failed` (what differs and where) /
  `unverifiable` (what is needed: a stand, a manual step, a test — handed over as a task,
  not as a hope). A criterion without a test and observed behavior is unverifiable,
  never passed.
- **Plus:** a scan for unsanctioned behavior (what the code does beyond the specs), an audit
  of the executor's report, spec-drift (a divergence without an amendment = failed; a stale
  spec — propose an amendment). Outcome: accepted / accepted with notes / changes required.
- **Key rule:** the reviewer does not fix — fixes go back into the plan for the executor;
  bugs go to root-cause.
- **When:** "review the implementation", "accept against the spec", "run acceptance".

## stand-acceptance — acceptance on a live stand

**Why:** closes the spec-review verdict "unverifiable — check on the live system". Shell
login (token in localStorage + cookies), token minting in an IAM container, direct service
calls, browser acceptance (chrome-devtools), logs and the DB, service rebuilds.

- **Input → output:** an acceptance item → observed behavior on the live stand
- **Key:** credentials and paths live in environment variables; the skill itself carries
  placeholders (sanitized); the subtleties of token invalidation and Windows wrappers are
  collected inside.
- **When:** "check on the stand", "accept on the stand".
- **Limitation:** a team-and-project skill — tied to the stand of a specific project,
  does not generalize.

## tech-writer — up-to-date specs + user manual

**Why:** the documentation loop after merge. Mode 1 — **audit**: compares the code against
the specs from the last sync point (the report `docs/audits/YYYY-MM-DD-doc-sync.md` stores
the hash of the last checked commit — which is also the starting point of the next run) and
finds four kinds of drift: undocumented (code without a spec), stale claim (a spec lies
about the code), orphan amendment (an amendment never reached the manual), unowned feature
(a feature with no spec at all). Each finding comes with file:line evidence and ready
amendment text; it is applied only after approval. Mode 2 — **user manual**: a skeleton
from the business specs (business cases → step-by-step how-tos), screenshots from the stand
via browser automation, and building `md → standalone HTML + PDF` with the skill's script
(`node <skill>/scripts/build-manual.mjs docs/manual`).

- **Input → output:** code + specs → audit report / `docs/manual/` (md + assets + html + pdf)
- **Key rules:** the manual's audience is the user, not a developer (no paths or internal
  names); the manual describes only verified behavior (by spec or live); everything else is
  marked `[draft: unconfirmed]`; screenshots come only from the dev stand + synthetic data.
- **When:** "check spec consistency", "sync the specs", "what is undocumented",
  "assemble the user manual", "update the manual".

## root-cause — bug → minimal fix

**Why:** treats the disease, not the symptom. The oracle is the expected behavior (the spec
or the user's words); the current code is the suspect, not the truth.

- **Flow:** reproduce (mandatory, otherwise it is not a fix but guessing) → isolate →
  the root cause in one sentence → a red test (it stays in the suite as a regression test;
  deleting it is forbidden) → a minimal fix → green test + full suite → report.
- **Key rule:** if the code does exactly what it was built for and something else is wanted —
  it is not a bug but a feature request → brainstorm. A risky fix (shared core, data,
  security) → spec-review in a fresh session. With an active plan, the fix becomes a plan
  task (spec-gate insists).
- **When:** "it doesn't work", "bug", "it crashes", "still broken after fixing".

## lazy — behavioral overlay

**Why:** the discipline of a lazy senior on top of any coding. The smallest complete change;
the reuse ladder (not needed → already in the codebase → standard library → installed
dependency → one line → minimal code); thinking once (two failures of the same approach —
switch approaches or ask); a 1–2 line report: what was skipped and what the risk is.

- **When:** any coding; phrases "keep it lazy", "simpler", "don't overcomplicate",
  "why so much", "be lazy", "yagni" — or complaints about overcomplication.
- **Never cuts:** validation at trust boundaries, error handling where data can be lost,
  security, accessibility, anything explicitly requested.

## kb-index — map of the documentation

**Why:** in a large corpus, the question "where is this described" costs a dozen reads.
The skill builds an index of document faces (id, title, gist, anchor) and a map for every
directory: the agent finds a document with one command and reads the needed section,
not the whole file.

- **Input → output:** documentation corpus → `.kbindex/index.json` (the contract
  `{ "schema": 1, "records": [...] }`) + `.kbindex/sections.json` (per-section term
  statistics, no texts) + `.kbindex/maps/<directory>/INDEX.md`; the index is not versioned
  and ignores itself in git.
- **How to search:** `kb.mjs search "<query>"` — two tiers: first by id, title, gist,
  anchor, and path, with an inflection fallback (`«»` finds `«»`); then by body —
  BM25 over sections, for words absent from the face (an identifier inside someone else's
  text, a term from the middle of a section). The output includes the anchor line
  `§<heading>:<line>` (for a body hit — the best section); read from there;
  `kb.mjs map <directory>` — the composition of a directory.
- **Graph:** `kb.mjs related <path|id>` — a document's neighbors (incoming/outgoing links
  and resolved `parent`/`depends_on`/… relations), `kb.mjs path <A> <B>` — the shortest
  chain of documents. Arguments resolve without guessing: an ambiguous `id` returns
  candidates.
- **Config:** `.kbindex.json` at the project root — `roots`, `include`, `exclude`,
  `gistMaxChars`, `bodySearch`. `exclude` sets privacy: paths enter the index without a body
  (no gist, no anchor, no links, no sections) — for example, client briefs.
- **When:** "where is X documented", "find the document about X", "what exists on X",
  "which documents relate to X", "refresh the index", "rebuild the map".
- **Key rule:** the index is a derivative; the source of truth is the files. No gist →
  add an intro paragraph to the document, not to the index; the Stop hook does not let a
  turn finish with a stale index (pi agent has no hooks — run `build` by hand after editing
  documentation).

## codestyle — repo conventions as a document

**Why:** the pipeline's executor works with fresh context — a task and a spec; it never
sees the repository, so it has nowhere to take conventions from. The skill extracts
**evidence-backed** conventions from the code and writes `CODESTYLE.md` to the repo root;
consumers (implementation-plan, spec-implementation, spec-review) reference it. The goal is
mimicry: agent code is indistinguishable from developer code.

- **Input → output:** repo code + git history → `CODESTYLE.md` (frontmatter
  `codestyle/generated/base` — a machine-readable freshness anchor).
- **Two modes:** generate — a full analysis (CLAUDE.md/AGENTS.md as normative → linter
  configs → git log → a sample of 15–25 files → rules with evidence → verification against
  a held-out sample); verify — a cheap cross-check against recent commits
  ("24 rules: 22 confirmed, 1 updated, 1 removed").
- **Hard rules:** a rule without `file:line` evidence is not recorded; generate never reads
  the previous document (anti-echo-chamber); linter configs are the primary source, their
  aspects are not paraphrased; a 150-line cap.
- **Freshness:** the codestyle-reminder hook (SessionStart, never blocks) counts code
  commits since `base`; the verdict — `node <skill>/scripts/codestyle.mjs status`.
- **When:** "write down the conventions", "rebuild CODESTYLE", "check convention freshness",
  "codestyle" — or a hook reminder.
- **Key rule:** the document describes how code is *written here*, not how it *should be* —
  it is a derivative of the code; the source of truth is always the code.

## Fast lane — SDD for small tasks

**Why:** the full pipeline pays off on a feature; on a spot fix it is friction, and the
team starts silently bypassing it. Fast lane fixes the short path as a mode with
invariants: SDD documentation even for a small task, but one artifact instead of four.

- **Entry criteria (objective):** one repo, ≤5 files, 1–3 acceptance criteria, no
  cross-repo contracts, migrations, or rollout order. Any "no" or doubt — the full pipeline.
- **Flow:** a mini-spec (what and why + 1–3 verifiable criteria, sourced from the request)
  in the header of a one-task plan `docs/plans/YYYY-MM-DD-<topic>-quick.md` →
  spec-implementation: one task, tests-first, one commit, `- Done:` → spec-review deferred
  and batched (before merge or weekly; unverifiable → stand-acceptance as usual).
- **Invariants (never cut):** tests-first for behavior changes, closure with `- Done:`,
  the deviation protocol (ruling / amendment / intent), a 1–2 line report, evidence in
  review.
- **Forbidden in fast lane:** cross-repo work, contract behavior, security-sensitive code,
  destructive operations, data migrations. **Two-strike rule:** an edit required an
  amendment or touched a contract — the next change in that area goes through the full
  pipeline.
- **The `fast` profile (`.spec-gate`):** fast lane is the project default; brainstorm /
  system-thinking / decompositor — only on the user's explicit request: plan-context reports
  the profile at session start, skill-gate in Claude Code blocks autonomous runs
  (in pi — orientation only, no blocking). The profile changes the default, not the
  permission.
- **When:** "do it quickly", "a small fix" — or the project profile.
