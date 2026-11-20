---
name: bug-hunt
description: Adversarial review of a diff, branch, or code area — hunt for bugs and security holes before they ship. Bugs — boundary values, off-by-one, error paths, race conditions, resource leaks, broken invariants, misuse personas (novice, power user); security — injection, authn/authz gaps, IDOR, secrets, SSRF, unsafe deserialization, crypto misuse, risky new dependencies. Use when the user asks to find bugs, hunt for defects, or audit the security of the code. Every finding carries a trigger scenario, fix criteria (the dev role's acceptance check), and severity, persisted as a report deduplicated against prior audits. A known reproducible bug goes to root-cause instead; spec compliance belongs to spec-review. Runs best in a fresh session; the hunter does not fix.
---

# Bug hunt

Hunt for what will break and what can be exploited — the adversarial counterpart of
spec-review (spec compliance) and code-review (quality). Assume the code is broken: the
author already believes it works, and the tests proved only what their author thought to
check. Read twice — as a destroyer feeding the code inputs it did not expect, and as an
attacker feeding it inputs it must never accept.

Run in a fresh session when possible; the hunter does not fix what it hunts.

## Flow

```
1 scope & entry points → 2 bug checklist → 3 security checklist → 4 findings & report
```

## 1. Scope and entry points

- The target: a diff, a branch, or a named area of the codebase.
- For a diff, trace each hunk to the entry points that reach it — an HTTP handler, a
  CLI, a cron job, a message consumer, a UI event. Code reachable from an entry point
  gets the full hunt; unreachable private helpers get the bug pass alone.
- Where untrusted data enters: request params, headers, uploads, file contents,
  environment, other services' payloads — and the database: yesterday's attacker may
  already sit in it.
- Security-sensitive surfaces the diff touches: auth and permissions, uploads, exec,
  templates, redirects, serialization, crypto.
- **Threat sketch first** — 15 minutes before the checklists: list the assets the target
  guards (data, money, privileges, availability), who can reach each, and through which
  entry. The sketch aims the hunt: checklist items touching an asset get depth, the rest
  get breadth. An audit attacks assets, not patterns.
- **Session charter** — one line before the checklists: the mission (what this hunt
  protects), the scope boundary (in / out), and a time-box — 25 minutes for a focused
  area, 45 for a diff, 90 for a branch. The box forces the trade the sketch already
  aims: depth on the assets, breadth elsewhere. When it ends, the report is written
  with what is in hand — an honest partial beats a silent overrun; follow-ups become
  the next charter, not overtime.
- **Installed analyzers are inputs**: where installed, run the project's semgrep rules
  and linters over the target — their findings are leads to verify like any other, never
  verdicts (tools propose, the hunter verifies); a lead that cannot earn a trigger
  scenario is dropped as a false positive with one line of why.
- A previous `*-audit` report for the topic (one glob: `ls docs/specs/*<topic>*`) → the
  hunt opens by re-verifying its findings (see §4), then hunts fresh ground. The old
  report is input, never truth: a finding marked fixed is re-proven, not believed.

## 2. Bugs — the destroyer's checklist

- **Boundaries**: empty / null / none, one, many, negative, zero, max, unicode,
  timezone and DST edges.
- **Misuse personas**: read the entry points as a novice (random input, ignored hints,
  the back button mid-flow) and as a power user (shortcuts, bulk actions, double
  submits, rapid repeats) — the author tested the happy path, not the clumsy or the
  hurried.
- **Off-by-one**: `<` vs `<=`, slicing ends, pagination, inclusive ranges.
- **Error paths**: partial failure midway — what state remains? Swallowed errors; retry
  without idempotency; cleanup skipped on throw.
- **Concurrency**: shared state, check-then-act, TOCTOU, unawaited promises, callbacks
  after teardown.
- **Resources**: handles not closed on the error path, timers and listeners not
  removed, unbounded caches and queues.
- **Invariants the code assumes but never asserts** — note which ones hold by luck.
- **Time**: parsing and rounding, duration vs timestamp arithmetic, clock skew.
- **Second pass — where hidden bugs live**: after the checklist, sweep the target once
  more by named symptom — a re-aim of the pass above, not a replacement:
  - **Async race** — the state changed between the check and the use; two competing
    updates of the same state.
  - **Stale state** — a cache, closure, or subscription still holds the value the
    source has since replaced.
  - **Missing state transition** — a state enterable but never left, or the reverse —
    hunt the incomplete transition table.
  - **Swallowed error** — an empty or generic catch turns the error into a silent
    fallback; follow the error branch, it must lead somewhere.
  - **Cross-boundary reset** — a shared reset or cleanup reaches into another module,
    session, or page.
  - **Conditional dead path** — a condition makes a branch unreachable — a typo in the
    comparison, a swapped operator, an always-false guard.

## 3. Security — the attacker's checklist

- **Injection**: SQL/NoSQL, command, path traversal, XSS, template, header, log.
- **Authn/authz**: a check missing on one endpoint is a hole with a map to it; IDOR —
  trusting object ids that came from the user; privileges taken from the client;
  confused deputy.
- **Secrets**: hardcoded, logged, echoed in error messages, committed fixtures.
- **The rest of the surface**: SSRF, redirects from user input, deserialization of
  untrusted data, crypto misuse (weak hash, ECB, static IV, homemade scheme).
- **New dependencies the diff adds**: known advisories, unmaintained packages.

## 4. Findings and report

- Persist the report as `docs/specs/YYYY-MM-DD-<topic>-<repo>-audit.md`, next to the
  specs of the feature.
- Findings live in a table — one row per finding: `location | class | severity |
  scenario` — classes from the checklists above (boundaries, off-by-one, error paths,
  concurrency, resources, invariants, time, injection, authz, secrets, surface,
  dependencies), so the next hunt and tech-writer's report card can count them.
- Every finding: location (`file:line`), the scenario that triggers it, severity.
  - Bugs: a reproduction sketch — concrete inputs, observed vs expected outcome.
  - Security: an exploitation sketch — who can send what, and what it yields.
  - Severity: **critical** / **high** / **medium** / **low** — impact × plausibility.
  - A findings table caps at **50 rows**; the rest collapse into one overflow line —
    `+N more (critical/high/medium/low)` — a table nobody finishes protects nothing.
    Overflow findings still route into the plan; they just do not scroll.
  - **Fix criteria**: what observation proves the bug fixed — the dev role's acceptance
    check, written so the fixer needs no further conversation to know they are done
    ("the retry dialog appears at most once per failure", not "fix the dialog").
- **No scenario, no finding**: a suspicious pattern without a way to trigger it is a
  note, never a finding.
- **A finding names its source kind** — live code, or a fixture / an example in docs
  or README / a demo / dead code. A structural finding in a non-live source is a
  note at most, never a table row — the table is the product's real exposure, and
  an example is not it. Substance outranks the source: a real-format secret in an
  example is still a finding, downgraded one step; a fake on its face
  (`example`/`sk-ant-…` placeholder) is not a finding at all.
- **Dedup on filing** — search, compare, create. Before a finding enters the table,
  sweep the prior `*-audit` reports (this topic's, and the neighboring areas when they
  overlap): the same trigger scenario already open there → link that finding and carry
  its status forward, never a duplicate row. Re-verification (below) re-proves what
  this report inherited; the dedup sweep is what stops the same bug being "found"
  twice. Two reports, one scenario, one finding — with both locations named.
- **Re-verification** (when a previous report exists): its carried findings get a
  status — **closed** (re-proven: the scenario no longer triggers), **not closed**, or
  **fixed with regression** (the old scenario is gone, a new one opened — a fresh
  finding, severity one step up). The header line: `Re-verified: N closed, M not
  closed, K regressions`.
- Critical security findings are reported to the user immediately, not only in the file.
- The report never contains live secret values — a finding names the secret's location,
  not its content.
- The report ends with `Recurring: <class>[, <class>…]` — the finding classes this
  report shares with its predecessor (`Recurring: none` when empty). That line is the
  pipeline's review memory: tech-writer aggregates these into CODESTYLE.md
  anti-pattern proposals.
- A two-line **debrief** closes it: what the charter got right or wrong, and where a
  follow-up hunt should aim first — the next hunter inherits the aim, not just the
  findings.
- Outcome: **no findings** / **findings listed** / **exploitable — fix before merge**.
- **The hunt loop converges or says so**: a re-hunt that yields no findings is
  terminal — `Converged: hunt N` closes the loop within the agreed budget, no
  filler findings to look busy and no silent extra pass. Until then every report
  names what is left and the budget line rules.
- Fixes go back into the plan (or root-cause — the dev role, if installed — for a single
  confirmed bug); this skill does not fix.

## Parallel hunters (scouts — by explicit permission)

- A large or risky target may be hunted in parallel: independent hunters, each with one
  checklist focus (e.g. one — concurrency and resources, one — authz and data flows,
  one — error paths and boundaries), plus the coordinator's own pass. Dispatch through
  the `scouts` skill — the grant, the mission charter, and the fan-in rules live there;
  this skill extends its one question with the loop count (how many hunt→fix→hunt
  iterations, recommended ≤3 — a default is named in the question, never assumed).
  Without subagents (denied, unanswered, or unsupported) the same foci run
  sequentially in one session. The fix inside the loop belongs to the dev role when
  roles are pinned (the hunter does not fix); without a pin the same session fixes
  between hunts.
- The coordinator deduplicates by scenario, not by location: two hunters naming the
  same trigger scenario is one finding. Disagreement (one calls it a bug, the other
  does not) is resolved by building the scenario out, never by vote.

## Rules

- **Evidence, not impressions**: every finding cites code and a trigger scenario.
- **The hunter does not fix** — fixing what you hunted destroys the independence that
  makes the hunt worth anything.
- **Layers, not substitutes**: vuln-guard and secrets-guard catch the moment of commit;
  this skill audits the code itself. Passing one layer has never meant much for the
  next.
- Write the report in the team's working language, which may differ from the language of
  this skill.

## Next

Findings with their trigger scenarios go to the dev role; the hunt loop re-runs fresh
scouts per the agreed budget until clean — or the iterations run out and the report names
what is left.
