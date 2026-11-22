---
name: root-cause
description: Diagnose and fix a bug — triage the failure (product defect / wrong test / environment-data mismatch / spec mismatch), reproduce it, trace it to the root cause, prove the fix with a red-then-green test. Use when something does not work as intended — a crash, wrong output, a failing test, a regression. Not for new features (brainstorm) and not for behavior the system gets deliberately right but nobody wants — those are feature requests too.
---

# Root cause

Fix the disease, not the symptom. The oracle is the **intended behavior** — a spec if one
exists, the user's statement otherwise. The current code is not the oracle; it is the suspect.

## Flow

```
0 triage (which of the four?) → 1 reproduce (evidence, always) → 2 isolate
→ 3 root cause (one sentence) → 4 red test → 5 minimal fix → green + full suite → 6 report
```

## 0. Triage — which of the four is this?

A failing report is one of four things, and only one of them is a product bug. Classify
before diagnosing — treating the wrong class as a bug produces wrong fixes:

- **product defect** — the code is wrong against its oracle → the full flow below;
- **wrong test** — the expectation is wrong; the spec, not the test, is the oracle →
  fix the test and name in the report why the expectation was wrong;
- **environment / data mismatch** — the failure lives in the stand, the fixtures, the
  seeded data → not a bug: report exactly what differs and hand it back;
- **spec mismatch** — the behavior is as built, but the spec says otherwise → not a
  code fix: the amendment protocol (spec-implementation's tiers), never a quiet change.

Cannot classify without seeing it happen → reproduce first (step 1), then classify —
evidence over assumption. The report always names the class; "bug" without a class is
a guess wearing a noun.

## 1. Reproduce — build the loop

- See the bug happen before touching anything: exact steps, input, environment, the wrong
  output. A bug you cannot reproduce you cannot fix — you can only guess.
- **The loop is the deliverable**: one named command, already run at least once, that shows
  the user's **exact symptom** — not "runs without erroring" — and is deterministic, fast
  (seconds, not minutes), and runnable without a human. No such command → the diagnosis has
  not started: do not read code for theories first, jumping to a hypothesis before the loop
  exists is the failure this step exists to prevent.
- Tighten the loop where you can: faster; sharper signal (assert the specific symptom, not
  "didn't crash"); more deterministic (pin the clock, seed the RNG, freeze the network).
- The loop's shape follows the bug, in preference order: a failing test; a curl/HTTP
  script; a CLI invocation diffed against a known-good snapshot; a headless browser
  script; a replayed capture; a throwaway harness; a property/fuzz loop for "sometimes
  wrong output"; a bisection harness handed to `git bisect run`; a differential loop (same
  input, old version against new); a human-in-the-loop script last.
- A flaky bug is chased toward a **higher reproduction rate**, not a lucky pass — a 50%
  flake is debuggable, 1% is not — loop the trigger, parallelise, add stress, inject
  delays until the rate moves. Cannot reproduce after an honest attempt → report
  exactly what you tried and ask for the missing environment details. Never "fixed it, probably".

## 2. Isolate

- Narrow the entry point: which request, which input, which code path. Bisect the
  pipeline — logs, direct calls, minimal inputs — until the wrong step is one call away.
- Minimize the loop until **every remaining element is load-bearing**: removing any one of
  them turns the command green — that is the exit criterion, not "small enough".
- Instrument with a unique prefix per investigation (`[DEBUG-a4f2]`): cleanup at the end
  is a single grep, and a tagged log cannot leak into a commit unnoticed.
- A multi-component system gets **boundary instrumentation before any fix**: log what
  enters and leaves each component's boundary and run once — see WHERE the values go
  wrong before theorizing why.

## 3. Name the root cause

- **Rank 3–5 hypotheses before testing any of them** — a single first-plausible theory
  anchors the whole diagnosis. Rank by likelihood and by cheapness to falsify, and give
  each the falsifiable shape: "if X is the cause, then changing Y makes the loop go
  green". Test the cheapest falsification first; the loop tells the truth, the ranking
  only sets the order.
- **Three failed fixes are the architecture talking.** Each fix that reveals new coupling
  in a different place is not a failed hypothesis — the pattern says the design, not the
  code, is wrong. Stop fixing, name the pattern, and take it to the user: an architecture
  discussion, not attempt #4. Before concluding "no root cause", go back to §2 — an
  incomplete investigation explains almost every such verdict.
- One sentence: "X happens because Y". The crash site is rarely the cause — walk the data
  flow backward to where the wrong value was born.
- Grep every caller of the code you are about to touch: the same cause often surfaces at
  several call sites. Fix it once in the shared code, not at each symptom.
- If the code does exactly what it was built to do, and that is not what is wanted — this
  is not a bug. Route it to brainstorm as a feature request (the analyst role; if it is
  not installed, record the request for that role — do not spec it yourself). This is
  step 0's spec-mismatch class catching up with the diagnosis — the classes hold.

## 4. Red test

- Write the smallest test that reproduces the bug. Run it: it must fail **for the bug's
  reason** — not on a typo, an import, or a setup crash. Wrong failure → fix the test first.
- This test stays in the suite as the regression guard; deleting it after the fix is
  forbidden. When the feature carries a cases artifact (`docs/tests/*-cases.md`,
  the `test-design` skill), the regression test joins it under a TEST-ID (source: this
  bug) — the suite and the registry never drift apart.
- No correct seam exists for such a test — say so instead of writing one that gives false
  confidence: the missing seam is itself a finding (an architecture defect), reported
  with the fix.

## 5. Minimal fix

- Fix the root cause and nothing else. The lazy rules apply in full: the reuse ladder,
  no drive-by refactoring, shortest working diff.
- Run the red test — green. Then the full suite — a fix that breaks its neighbors is not
  a fix; any failure is reported by name before moving on.
- **Then make the bug impossible, not just fixed**: validate at every layer the bad data
  passes through — entry checks, business logic, environment guards — one test per layer.
  Each layer has caught bugs the others missed.
- If the fix turns out to change behavior or contracts beyond the bug — the "bug" was a
  design decision — stop: that is an amendment through spec-implementation's protocol,
  not a quiet redesign.
- Working mid-feature with an active plan? The fix becomes a new task in that plan —
  the spec-gate hook will insist, and rightly so: unplanned work is never absorbed
  silently. A standalone bugfix without a plan is unaffected — unless the project runs
  `.spec-gate` in `hard` mode; then the fix goes through a minimal plan task first.

## 6. Report

- The triage class first (product defect / wrong test / environment-data mismatch /
  spec mismatch) — the reader's first question is "what kind of failure was this?".
- Root cause in one sentence; the fix in one sentence; the regression test by name; the
  hypothesis that turned out correct stated explicitly — the next debugger starts from
  it, not from the ranked list.
- Same-cause call sites checked (list them), and anything left suspicious nearby.
- Risky fix (shared core, data, security) → send it through spec-review in a fresh session (the qa role; if it is not installed, a fresh review session before merge).
