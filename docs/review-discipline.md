# Review discipline — adoption plan (shipped in 0.32.0)

Origin: a survey of an industrial QA-automation agent-pack (an external organization,
2026-11-19 — roles, rules, workflows, ~58 archived qa-skills). Most of its machinery the framework
already has, often in a stricter form (severity tables, re-verification, criterion-by-
criterion verdicts, reviewer-does-not-fix, skill-gate enforcement). This plan takes only
the honest delta: practices that fill a real gap here. Rejected candidates are listed at
the end so they are not re-litigated.

**Status: all three waves shipped in 0.32.0** (originally waves 2–3 targeted 0.33.0 and
the backlog — the work landed together). One rename along the way: the planned
`specialist init` skill shipped as `bootstrap` — `/init` is a built-in command on some
hosts. The tracker-adapter backlog item stayed a backlog item (no tracker integration
exists yet).

## Wave 1 — 0.32.0

### 1.1 `bash-policy` hook — auto-approve the provably read-only

**Gap.** Read-only commands (`git log`, `git diff`) prompt for permission like any other;
agents and users both pay the friction, and the safe subset is mechanically
distinguishable.

**What.** `hooks/lib/bash-policy.mjs`, PreToolUse on Bash. Auto-approve a command only
when all three hold:

1. **Read-only** — matches a conservative allow-list (`git status|log|diff|show|blame`,
   `git branch`/`git remote` without mutating flags, `ls`, `cat`, `pwd`, `test -e`);
2. **Workspace-bound** — every path argument resolves inside the working tree;
3. **No side-effect plumbing** — no `>` / `>>` redirection, no pipes, no `&&`/`;`/`||`
   chaining into a second command that fails the same test.

Anything else — including any parse doubt — returns **no decision** (the host's normal
permission flow applies). Fail-closed: a classification error can never widen what is
auto-approved.

**Source.** agent-pack `rules/tool-permission-policy.md` (the three-part criterion and
fail-closed principle, verbatim adopted).

**DoD.** Hook + unit tests (approve / no-decision / chained / redirected cases), entries
in `hooks/hooks.json` and `hooks/hooks-codex.json`, a section in `docs/hooks.md`, the
hook table in README.

### 1.2 `mutation-guard` hook — outward mutations are the user's command (opt-in)

**Gap.** `spec-implementation` already says "stop and ask before outward side effects
(push…)" — but nothing enforces it mechanically. Commits are part of the framework's loop
(one task = one commit) and stay allowed; what needs a gate is everything that leaves the
working tree or rewrites history.

**What.** `hooks/lib/mutation-guard.mjs`, PreToolUse on Bash, **opt-in** via `.spec-gate`
(`mutation-guard: on` — the suite-gate pattern). When on, agent-run `git push`,
`git reset --hard`, `git rebase`, `git branch -D`, `git checkout -- .` / `git restore .`
are blocked with a message saying: outward/history-mutating operations run on the user's
explicit command — confirm in chat or run it yourself.

**Source.** `.agent/rules-local/commit-rule.md` ("any mutation outside the agent's working
copy is the user's action, not the agent's by default").

**DoD.** Hook + tests (off by default, on blocks the listed forms, commits unaffected),
both hook configs, `docs/hooks.md`, README hook table.

### 1.3 code-review — the stale-impact lens and churn ordering

**Gap.** The skill judges the new code well, but a diff also acts on what already exists:
tests whose subject silently changed, coverage quietly removed. Today nobody answers "what
may now lie".

**What.** A third pass (§3.5 or a subsection of §3): read the diff against the existing
suite and produce three lists — **re-run** (tests whose behavior the diff touches),
**may now lie** (their subject changed under them), **no longer covered** (coverage the
diff removed). Each list item tagged Must / Should / Optional. For large diffs, review
order is ranked by churn: `git log --follow` frequency of the touched files × centrality
(shared modules before leaf code) — the hot files get the deep read, the leaves get
breadth.

**Source.** qa-changelog-analyzer (the run / update / add triple), qa-risk-analyzer
(Risk = Complexity × ChangeFrequency × (1 − TestCoverage) — adapted to what git gives for
free).

**DoD.** SKILL.md sections; findings classes extended only if a finding type needs a new
row; `docs/skills.md` sync.

### 1.4 root-cause — triage before diagnosis (the quartet)

**Gap.** The skill assumes the report is a product bug. In practice a failing report is
one of four things, and three of them are not bugs — treating them as bugs produces wrong
fixes.

**What.** Step 0 before reproduce: classify the report as exactly one of

- **product defect** — the code is wrong against its oracle → the full root-cause flow;
- **wrong test** — the expectation is wrong; the spec is the oracle → fix the test, name
  why the expectation was wrong;
- **environment / data mismatch** — not a bug → report what differs, hand back;
- **spec mismatch** — behavior is as built, the spec says otherwise → the amendment
  protocol, not a code change.

Cannot classify without seeing it happen → reproduce first, then classify (evidence over
assumption). The report always names the class.

**Source.** agent-pack `roles/dev.md` — the triage quartet ("defect of the product /
wrong test / environment-data mismatch / mismatch with the requirement").

**DoD.** SKILL.md step 0 + report line; existing routing notes folded into it.

### 1.5 bug-hunt — fix criteria and dedup on filing

**Gap.** Findings carry a trigger scenario but not the check that proves the bug fixed —
dev decides acceptance alone. And a new hunt can re-file a scenario an older report
already owns.

**What.** Every finding gains **fix criteria** — the observable check that proves it
closed (the dev role's acceptance for the fix; per the source pack's bug template, "the developer
reads this list like AC"). Filing gets a dedup rule: a new scenario is searched against
prior `*-audit` reports — same scenario already open → link and carry its status, never a
duplicate row. Cheap addition: one line in the destroyer pass for the misuse personas
(the novice's random input, the power user's shortcuts).

**Source.** `.agent/templates-local/bug.md` ("Критерии исправления"), qa-bug-ticket-creator
(Search → Compare → Create), qa-manual-test-designer (personas).

**DoD.** SKILL.md §4; `docs/skills.md` sync.

## Wave 2 — 0.33.0

### 2.1 spec-review — a green run is not evidence; NFR measurability

**What.** §2 sharpened: a passing test is evidence only when the test's assertion covers
the criterion — cite the assertion against the criterion; a green suite by itself proves
nothing (pass ≠ verified). Non-functional criteria (performance, availability, capacity)
must be **criterion + measurement method + threshold + environment**; missing any field →
unverifiable, with an amendment proposing the four fields.

**Source.** qa-traceability-matrix ("a Pass run ≠ a verified link"), qa-nfr-analyst.

### 2.2 Relay upgrade — blast radius in the dev→qa artifact

**What.** The executor's report (spec-implementation "Final report") gains a **touched
surface** section: what changed where beyond the obvious diff paths, and where regression
risk now sits — the reviewer's starting map. role-dev's handoff line and dispatch's relay
table updated to name it.

**Source.** dev.md — "the list of affected components — for review and for QA (what it
touched, where to look for regression risk)".

### 2.3 spec-implementation — granular blocking

**What.** An open spec question blocks only the work it touches; the rest of the plan
proceeds. Blocked tasks are marked in the plan with the question they wait on.
Stop-and-ask stays for destructive / security / outward operations — those are never
granular.

**Source.** dev.md — "an unresolved open question concerning a specific piece blocks
exactly that piece, not the whole task".

### 2.4 role-qa — anti-contamination

**What.** Review from artifacts, not from history: never load the transcript of the
session that produced the work — it biases the reviewer toward the author's reasoning.
Subagent handoffs pass artifacts, not conversation. Findings name the mismatch; a
suggested fix direction is explicitly a hint, not a design (the boundary between reviewer
and creator).

**Source.** agent-pack `roles/reviewer.md` ("do not read the artifact's creation history
— it skews the assessment").

### 2.5 role-dev — quality guards are load-bearing

**What.** One principle: never remove or weaken a quality guard (a test, a hook, a lint
gate) to make work pass; removing a guard is itself a change requiring explicit
justification. Ties root-cause's "fix the cause, not the indicator" to the framework's
own gates (suite-gate, secrets-guard, vuln-guard).

**Source.** devops.md ("does not remove existing quality limiters without explicit
justification").

### 2.6 brainstorm — value-first checks *(check the quality bar first, add what's missing)*

**What.** Two checks in the quality bar: **problem, not solution** (strip every mention
of implementation — the need must still stand on its own), and **criteria not
gold-plated** (every criterion traces to the stated value; a criterion beyond the need is
a finding, not a bonus).

**Source.** quality-gates.md §1.0 — "a formally correct artifact describing the wrong
problem is more dangerous than a naming error".

### 2.7 system-thinking — decision records, append-only *(check current output shape first)*

**What.** Where the skill names an architecture decision, record it as **context →
decision → alternatives rejected (with reasons) → consequences**, append-only: a changed
decision appends a new record referencing the old, never edits it.

**Source.** architect.md + the ADR template ("does not accept a decision without
comparing alternatives"; "does not amend old ADRs retroactively").

## Wave 3 — backlog (no version assigned)

- **`trace-audit` skill (analyst).** A mechanical audit over `docs/specs/`: must-criteria
  without a runnable `Verify:`, parent/children desync beyond the index kb-gate checks,
  findings open across consecutive reports, specs that never received a review. Joins
  `scripts/roles.mjs`, README, `docs/skills.md`.
- **`specialist init` skill.** Bootstrap a repo for the framework: `.spec-gate`,
  `docs/specs/`, `CODESTYLE.md` (via codestyle's scan), with the migration rule "port the
  legacy docs, never rewrite their meaning".
- **Amendment status.** Proposed amendments in review reports carry an explicit
  `proposed / accepted / rejected` status; tech-writer aggregates acceptance over time.
- **Skill template.** Add optional Boundaries ("what this skill does not do") and
  Troubleshooting (symptom → likely cause → fix) sections; apply to new skills, no
  mass rewrite of existing ones.
- **Tracker-adapter pattern.** Only if a tracker integration ever lands: read CLI free /
  write requires an explicit command, dry-run by default, audit log per mutation,
  idempotency via back-written external IDs.

## Not adopted (and why)

| Candidate | Reason |
|---|---|
| Expanding the role grid (reviewer / DM / devops / installer as roles) | Their discipline lands inside qa/dev as principles; the enforcement here (skill-gate, relay artifacts) is already stronger than their declarative activation |
| `tc-to-autotest` skill | Tests-first in spec-implementation is already the pipeline; a separate TC→code generator would fork the oracle |
| Numbered-ID naming rules (max+1 scans, sub-numbering bans) | This framework's artifacts are date-slug files (`YYYY-MM-DD-<topic>-<repo>.md`); no ID registry exists to guard |
| The source pack's severity emoji scale (🔴/🟡/🔵) | Each skill already carries its own severity vocabulary, tuned to its report format |
| PlantUML self-containment rules | No diagram artifacts in the pipeline today; revisit if system-thinking starts emitting diagrams |
| Kaiten scripts / tracker workflows | Tool-specific; the generic pattern is captured in the backlog item above |

## Common definition of done

Every item: the SKILL.md / hook edit, tests where a hook or script changed
(`node --test hooks scripts skills`, hook files never named `test-*`), the matching
section in `docs/skills.md` / `docs/hooks.md`, the README tables, `scripts/roles.mjs` if
a new skill appeared. Release: merge to main, tag the merge tip.
