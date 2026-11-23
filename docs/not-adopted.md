# Not adopted

The repository's why-not ledger: one row per rejected concept, with the reason and
where the question was raised. It exists so a rejected candidate is not re-proposed
from scratch every few months — a closed row is unambiguously off the table, and
reopening one is the user's call (the row grows a prior-mentions line; it is never
deleted to make room).

Rules of the ledger:

- **One row per concept**, matched by concept similarity, not wording — a "night theme"
  request matches a dark-mode row even though no words overlap.
- **The reason must stay true**: "we're busy now", "not this release" — those are
  deferrals, and a deferral does not live here; it stays open where the work is tracked.
- **Already-built behavior is never recorded here** — a wontfix "already implemented"
  cites where the behavior lives; it was built, not refused (defect-triage §6).
- New rows land with the mining pass, release, or review that raised them; the source
  columns name releases, not people.

| Concept | Why not | Raised |
|---|---|---|
| Session memory / instincts / continuous learning | A state file for session state is §9's anti-pattern: agent edits and `git pull` are indistinguishable to a file; the spec chain in `docs/specs/` is the memory | 0.33.x review; the 0.32.0/0.37.0 mining |
| A gate guarding the gates (meta-enforcement layer) | Enforcement that audits enforcement recurses; the hooks are held by compliance, the tests, and this document | 0.33.x review |
| A verification-loop skill re-running checks until green | Duplicates the convergence contracts spec-review and code-review already terminate on (`Converged: pass/hunt N` — zero findings is terminal, nothing is written to look busy) | 0.37.0 mining |
| Coverage-percentage targets | A coverage number rewards covering lines, not criteria; the contract is criterion ↔ case coverage in both directions (`cases.mjs check`) | 0.37.0 mining |
| Framework/language packs (per-stack test or review bundles) | Not this repository's layer: the skills hold domain process, the stack belongs to the target repo | 0.37.0 mining |
| A distribution platform (catalogs, bundles, presets over the manifests) | Five hosts already ship through their native manifests; a second distribution layer is permanent surface with no new capability | 0.39.0 mining |
| A workflow engine with expressions | Host-level capability; skills are prose on purpose — the logic lives where the host runs it | 0.39.0 mining |
| A hook-registration layer above the host manifests | The manifests are the single registration record; a second registry is a second source of truth to drift | 0.39.0 mining |
| `[NEEDS CLARIFICATION]` spec markup | The Open questions table with working assumptions carries the same information structured, checkable, and with the risk named | 0.39.0 mining |
| Property-testing twins, generated fixtures as a service | No domain core here needs them; cases are graded by commands already — a second oracle would shadow the first | 0.40.0 mining |
| A generator writing SKILL.md bodies | Skills are written prose judged in the clean room; a generator recreates the echo chamber §9 forbids for artifacts | 0.40.0 mining |
| affected-CI / test quarantine mapping | The commit boundary is decided once (suite-gate); per-file CI routing is the host's job, not the framework's | 0.40.0 mining |
| Supply-chain machinery (SLSA, SBOM) | Not the framework's layer; the vulnerability window here is the git boundary the guards already hold | 0.40.0 mining |
| A security-scanner rule set of its own, A–F scoring | Grades invite optimizing the grade; findings with a source kind and fix criteria do the work without a scoreboard | 0.40.1 mining |
| Threat-intel/CVE feeds, evidence packs | Feed maintenance is permanent surface for signal the vuln-guard window does not consume | 0.40.1 mining |
| A full model-vs-model adversarial pipeline | The same model writing and reviewing shares one blind spot — the fix is fresh sessions and independent graders, not a second model | 0.37.0 mining |
| A user-facing router skill over all flows | dispatch routes by role; the roles map and the compliance router-check keep it honest — a second router lies twice | 0.41.0 mining |
| A multi-session decision-map skill | The spec chain in `docs/specs/` is the cross-session state and plan-context orients at session start; decision areas ride the Open questions table (brainstorm's fog rule) | 0.41.0 mining |
| A session-handoff skill | The plan and spec artifacts are the handoff; a compaction summary duplicating them is a second ledger | 0.41.0 mining |
| Wizard generation for human-only steps | stand-acceptance's charter and test-analysis's manual grader cover the human-in-the-loop steps; a generator for them is a niche inside a niche | 0.41.0 mining |
| Removing question budgets (caps conflate under-specification with prompt quality) | The budget is measured here and enforced mechanically; the assumption-below-the-line rule handles the low-value-question problem the cap gets blamed for | 0.41.0 mining |
| Removing the recursion guard from skill prose ("the harness's job") | One line, fails safe, costs nothing; hosts differ and the budget lives with the lead | 0.41.0 mining |
| Writing-craft skills (beats, shape, fragments, teaching workspaces) | tech-writer owns the docs surface; genre craft is not framework surface | 0.41.0 mining |
| A TS deep-modules config scaffold | Language-specific scaffolding; the design vocabulary entered code-review and system-thinking instead | 0.41.0 mining |
| An autonomous software factory (unattended loop orchestrators, ratchet automation) | "A run never waits for a human" contradicts fail-closed; every stage here ends at a user decision by design | 0.41.0 mining |
| A wiki-memory orchestrator (chief-of-staff shape) | State files for session state again (§9); "write history, not the present" is absorbed where it belongs — dated decision records | 0.41.0 mining |
| Structured question pickers for the interview | Plain chat keeps questions open-ended; a picker pushes pre-baked answers onto decisions that deserve the user's words | 0.41.0 mining |
| Renaming skills to dodge host built-ins | How a host resolves a name collision is the host's behavior; renames happen only for this repo's own discovery rules (the suite-gate precedent: `node --test` executes `test-*` files) | 0.41.0 mining |
| A go/no-go readiness report format | The review verdict and the cases artifact already decide readiness; a second report re-states them | 0.32.0 survey |
| A loop-discipline skill (loop-design-check shape) | Composable: bug-hunt's iterations, brainstorm's Must-not boundaries, and the reconciliation line in test-design carry it; "a repo that doesn't deserve a loop will only have its errors amplified by one" — the observed-failure bar is not cleared | 2026-11-22 four-donor recheck |
| receiving-code-review as a standalone skill | The receiving side composes into spec-implementation's flow; a separate skill fails the compose bar | 2026-11-22 four-donor recheck |
| Dual independent reviewers (council/santa-method) | The Converged contract covers convergence; the portable part — no shared context between reviewers — lives in the scouts' charters | 2026-11-22 four-donor recheck |
| gateguard as a hook (deny-until-facts) | spec-gate already demands mechanical artifacts (the plan's Files lines); the principle — self-evaluation is not evidence — is CODESTYLE §12 doctrine | 2026-11-22 four-donor recheck |
| An agent-architecture-audit skill (12-layer agent-stack diagnostic) | This repository's agents do not audit agent pipelines; the failure-name vocabulary is noted in defect-triage on demand | 2026-11-22 four-donor recheck |
| Sprint/epic lifecycle ledgers, model-vs-model self-rating scorecards | File-based sprint state is §9's anti-pattern; the scoreboard family — grading invites optimizing the grade | 2026-11-22 four-donor recheck |
