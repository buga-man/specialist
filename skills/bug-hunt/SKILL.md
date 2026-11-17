---
name: bug-hunt
description: Adversarial review of a diff, branch, or code area — hunt for bugs and security holes before they ship. Bugs — boundary values, off-by-one, error paths, race conditions, resource leaks, broken invariants; security — injection, authn/authz gaps, IDOR, secrets, SSRF, unsafe deserialization, crypto misuse, risky new dependencies. Use when the user asks to find bugs, hunt for defects, or audit the security of the code. Every finding carries a trigger scenario and severity, persisted as a report. A known reproducible bug goes to root-cause instead; spec compliance belongs to spec-review. Runs best in a fresh session; the hunter does not fix.
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

## 2. Bugs — the destroyer's checklist

- **Boundaries**: empty / null / none, one, many, negative, zero, max, unicode,
  timezone and DST edges.
- **Off-by-one**: `<` vs `<=`, slicing ends, pagination, inclusive ranges.
- **Error paths**: partial failure midway — what state remains? Swallowed errors; retry
  without idempotency; cleanup skipped on throw.
- **Concurrency**: shared state, check-then-act, TOCTOU, unawaited promises, callbacks
  after teardown.
- **Resources**: handles not closed on the error path, timers and listeners not
  removed, unbounded caches and queues.
- **Invariants the code assumes but never asserts** — note which ones hold by luck.
- **Time**: parsing and rounding, duration vs timestamp arithmetic, clock skew.

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
- Every finding: location (`file:line`), the scenario that triggers it, severity.
  - Bugs: a reproduction sketch — concrete inputs, observed vs expected outcome.
  - Security: an exploitation sketch — who can send what, and what it yields.
  - Severity: **critical** / **high** / **medium** / **low** — impact × plausibility.
- **No scenario, no finding**: a suspicious pattern without a way to trigger it is a
  note, never a finding.
- Critical security findings are reported to the user immediately, not only in the file.
- The report never contains live secret values — a finding names the secret's location,
  not its content.
- Outcome: **no findings** / **findings listed** / **exploitable — fix before merge**.
- Fixes go back into the plan (or root-cause for a single confirmed bug); this skill
  does not fix.

## Rules

- **Evidence, not impressions**: every finding cites code and a trigger scenario.
- **The hunter does not fix** — fixing what you hunted destroys the independence that
  makes the hunt worth anything.
- **Layers, not substitutes**: vuln-guard and secrets-guard catch the moment of commit;
  this skill audits the code itself. Passing one layer has never meant much for the
  next.
- Write the report in the team's working language, which may differ from the language of
  this skill.
