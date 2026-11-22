---
name: retro
description: Improve the agent's environment after real work — a retrospective over a session, a feature run, or a release that turns recurring friction into wired checks and documented conventions, not resolutions. Use when work ends and the user asks what to improve, when the same friction costs a second session, or when a review's Recurring class keeps returning. The output is wired, not written — a check or a rule that executes, never advice to remember. Not for fixing product code (root-cause) and not for one-off mistakes with no pattern.
---

# Retro — the environment, not the code

A retro looks at how the work went and changes the **environment** the next session
works in: checks, conventions, navigation, configuration. The code itself is other
skills' territory (root-cause, code-review); the point here is that the mistake cannot
happen the same way again. The output is wired, not written — a retro that ends in
advice ("remember to…") has produced a wish list, not a retro.

## Flow

```
1 collect candidates → 2 sort mechanical vs judgement → 3 propose the wiring
→ 4 the user picks → 5 wire → 6 record
```

## 1. Collect the candidates

- Walk what actually happened: the session's detours (what was re-done, re-found,
  re-asked), the review reports' `Recurring:` classes, the triage report's aging and
  recurring classes, the hooks that fired or should have, the context spent on something
  one command could have found.
- A candidate names the friction, not the fix: "the suite was run four times for one
  task" — not "run the suite less".
- **Unwired checks come first**: a check that already exists but sits unwired or
  silently broken is the finding, not a reinvention proposal — a linter present but not
  in edit-guard's order, a `.suite-gate` commented out, a CODESTYLE rule nothing scans
  for, a `cases.mjs check` nobody runs before handoff.
- **The no-op hunt**: an instruction the session followed that changed nothing versus
  the default — in steering files, skill text, or plans. The test is model-relative:
  would *this* executor behave differently without the line? Settle it by comparing
  behavior, not by debating the wording.

## 2. Sort — mechanical or judgement

- **Mechanical** — the friction has a deterministic shape (a format, a command, a file
  presence, a regex): it gets a deterministic check, full stop. Default to building the
  check over writing the rule — a check the repo runs beats a convention the agent must
  remember.
- **Judgement** — the friction needs taste or trade-offs (naming, structure, when to
  fan out): it gets a documented convention — a CODESTYLE.md rule through the
  `codestyle` skill's evidence protocol, or an amendment to the owning skill's text.
- Both get one question before proposal: **does the framework already carry this?** A
  skill, a gate, or a `.spec-gate` option that answers it means wiring what exists, not
  building a new one — and a candidate composable from existing pieces is not a new
  piece (CODESTYLE §6's bar).

## 3. Propose the wiring

Each proposal is one line of friction plus one line of mechanism:

- a hook or gate change (`hooks/hooks.json` + `hooks/lib/` — the docs/hooks.md
  contract; pi extensions, the OpenCode plugin);
- a config the project already owns: `.spec-gate` (mode, the scouts pin,
  mutation-guard), `.suite-gate`, `.secrets-allow` / `.vuln-allow`, `.kbindex/`;
- a CODESTYLE.md rule (through `codestyle` — evidence from real code, never
  aspiration);
- a documentation change (README, docs/) when the friction was navigation — something
  one grep would have found, and nobody grepped;
- a skill amendment when the skill's own text caused the detour (the Amendments
  protocol — the owning role approves).

Present the proposals as one table — friction | class | mechanism | what it would have
caught this session — and stop. **The user picks; nothing is wired without their
say-so.**

## 4. Wire (after the pick)

- Land each chosen mechanism where it executes: hook changes through the manifests and
  the lib cores (docs/hooks.md), config changes through the project's `.spec-gate`
  family, rule changes through `codestyle`'s protocol, doc changes as normal edits.
- Relaxing an existing linter/formatter config or silencing a guard is the user's
  decision made outside the retro — the config-guard block on such an edit is the
  system working, and the retro routes the request to the user instead of working
  around it.
- Every wired change lands as a normal commit on a branch; the retro never commits
  itself.

## 5. Record

- Save as `docs/specs/YYYY-MM-DD-<topic>-retro.md`: the candidates with their session
  evidence, the mechanical/judgement split, the proposal table, what the user chose,
  and what got wired — each wired line with its `file:line`.
- Durable rejections (a concept, not a circumstance) land in `docs/not-adopted.md`;
  "not this release" stays out of the ledger — it is a deferral and stays open.
- The next retro reads the previous report first: an unwired proposal from last time is
  re-raised by name before new candidates are collected — an environment debt ages
  exactly like a defect.

## Rules

- **The environment changes so the mistake cannot happen again** — the wired line is
  the deliverable; prose nobody executes is not done.
- **Standards are imposed by the review side**: the implementation agent carries the
  most context pressure, the reviewer the least — a rule the reviewer can check beats a
  rule the implementer must recall mid-work.
- **One candidate, one mechanism** — a friction explained by three causes gets three
  proposals or one honest "unclear", never a bundled guess.
- Write the report in the team's working language.

## Boundaries

- **Can do autonomously** — collect candidates, read configs and reports, classify,
  draft proposals and the report.
- **Requires confirmation** — every wiring step (hooks, configs, CODESTYLE, skill
  text), anything touching the git boundary.
- **Will not do** — fix product code (root-cause's), relax or bypass an existing guard
  (config-guard's territory — the block is correct), edit linter/formatter configs,
  commit or push.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The retro ends as a list of good intentions | Candidates were sorted as judgement that are mechanical | Re-run §2 — a deterministic shape gets a check, not a rule |
| The same friction returns next session | The proposal was never wired, or wired where nothing executes it | Check the report's wired lines for `file:line` — an unwired proposal is the retro's own failure |
| Everything is proposed as a new hook | §3's first question was skipped | Check the skills, the gates, and the `.spec-gate` options before building anything |

## It's working if

- The next session's instance of the friction is caught by a check or answered by a
  document — not remembered by an agent; proposals that all begin with "remember to"
  are a wish list, and the retro is not finished.
- The report's wired lines carry `file:line` — a proposal without a landing spot is
  not wired.

## Next

Wired checks join the repository's own gates (docs/hooks.md holds the contract);
CODESTYLE rules go through `codestyle`; report-scale recurring classes still flow
through tech-writer's review memory — the retro is the session-scale complement to that
report-scale loop.
