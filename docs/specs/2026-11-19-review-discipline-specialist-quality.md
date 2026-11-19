# Review: feat/review-discipline (0.32.0) — quality & transfer completeness

Branch `feat/review-discipline` (8421c7e) against `main` (fb97d19): 16 commits, 64 files,
+1792/−99. The branch ports the "honest delta" from an industrial QA-automation
agent-pack survey (docs/review-discipline.md) into the framework: two hooks
(bash-policy, mutation-guard), two new skills (trace-audit, bootstrap), and twelve
upgrades to existing skills. Two Explore scouts cross-read the full source pack
(rules/roles/workflows/templates + 58 archived qa-skills); this review read the whole
diff, the hook cores in depth, and the suite.

Re-verified: no predecessor `*-quality` report for this topic (docs/specs/ was empty).

**Outcome: worth a pass** — one worth-fixing finding in mutation-guard; the transfer
itself is complete and honest (every position the plan declares is verifiably in the
code; nothing the plan rejected was lost).

## Findings

| # | Location | Class | Severity | Direction |
|---|---|---|---|---|
| 1 | `hooks/lib/mutation-guard-core.mjs:28` | coverage gap (logic) | worth fixing | `git checkout <ref> -- <paths>` (e.g. `git checkout HEAD~2 -- src/`, `git checkout main -- file`) is not recognized, though it is the same forced discard of working-tree state as the covered `git checkout -- <paths>` — the guard's own stated intent ("a forced discard of working-tree state"). Extend the pattern to `checkout\s+\S+\s+--\s` (a ref token before `--`), add tests for both shapes. |
| 2 | `hooks/lib/mutation-guard-core.mjs:23` | boundaries | note | `git stash drop` / `git stash clear` discard stashed work irreversibly — same hard-to-undo class as `clean`/`branch -D`, but outside the recognized shapes. Deliberate list, documented; candidates for a follow-up if stashes ever enter the flow. |
| 3 | `hooks/lib/mutation-guard-core.test.mjs:5` | naming | note | The test header calls the core's direction "fail-open"; the core, the adapter, and docs/hooks.md call the same thing "fail-safe". Pick one word for one direction. |
| 4 | `hooks/lib/bash-policy-core.mjs:85` | naming | note | The `--output` disqualifier is checked for every command head, but the comment scopes it to git ("git … --output=… writes"). Harmless (fail-closed), but the code is broader than the comment says. |
| 5 | `docs/review-discipline.md:118` | accuracy | note | After anglicize (PR #8), the quoted source section reads `("fix criteria")`, while the actual external template's section is titled in Russian. Consistent with abstracting the source ("an external organization"), but the quote no longer matches the artifact it names. |

## Quality & logic pass — what held

- **bash-policy-core.mjs**: clean. The three-check invariant (read-only head /
  workspace-bound / no plumbing) is applied per segment with no exceptions found; the
  hostile cases hold up — `git -C /abs` rejected, `git branch <name>` (create) rejected
  without `--list`, `--output=` caught, `$(`/backticks/`&` caught, a `;`-chain poisoned
  by one mutating link. The false-split caveat (quotes containing separators → unknown
  segment → "none") is correctly fail-closed. Tests cover the allow-list, chains, and
  plumbing.
- **mutation-guard-core.mjs**: the shape list is tight, `-C` prefixes honored, chains
  checked per segment, `branch -D`/`-d --force` clusters handled (including `-Dv`),
  `restore --staged` correctly exempted. Block reason is a single actionable line.
  Finding 1 is the only intent gap found.
- **spec-core.mjs**: the `mutationGuard` field extends the config in the file's own
  style — additive, fail-safe default (`false`), unknown values never enable.
- **Skill upgrades**: all twelve verbatim match the plan and cross-reference each other
  (root-cause step 0 ↔ its §3; spec-implementation touched surface ↔ dispatch relay ↔
  role-dev handoff; bug-hunt fix criteria ↔ role-dev's acceptance reading). New skills
  follow the template including the new optional Boundaries/Troubleshooting sections.
- **Wiring**: roles.mjs, both host manifests, docs/skills.md, docs/skill-index.md,
  README — all synchronized; trace-audit/bootstrap correctly absent from STAGE_SKILLS
  (they are not pipeline stage skills); the suite's role-map tests were *generalized*
  (shared rides along → iterate ROLE_MAP.shared), not weakened.

## Transfer completeness vs the source pack (the scouts' half)

The plan's declared waves are all shipped and verifiable in the code. The gaps are
ideas the plan never mentioned (neither adopted nor rejected). Candidates, by value:

| # | Candidate | Source | Why / where it would land |
|---|---|---|---|
| 1 | **Decisions pass in code-review** — diff is checked against the spec chain's recorded decisions ("Decisions and rationale"), violation = blocker | workflows-local/code-review.md | system-thinking carefully records decisions; nobody mechanically reconciles code against them (code-review reads only CODESTYLE.md). Cheap: one bullet in code-review §1/§2. |
| 2 | **Contract completeness gate** — every §Contracts endpoint carries parameters + request example + 200 example + status-code table + limits, or names "no limits" | rules/quality-gates.md §1.4, spec-api template | system-thinking §Contracts says "meaning, not code" but has no completeness checklist; an incomplete contract resurfaces mid-implementation as an unplanned dev-role "decision". |
| 3 | **Incoming-change classification** — a doc edit is classified by impact: wording / touches a criterion (stop, confirm) / contradicts a recorded decision (conflict, don't apply); freeze while awaiting external acceptance | workflows/stakeholder-review.md | tech-writer classifies drift from the code side; the symmetric discipline for human-side edits doesn't exist. Matters once acceptance cycles get long. |
| 4 | **Exploratory charter + debrief** — mission / scope / time-box 25-45-90 / notes template / debrief | qa-manual-test-designer | bug-hunt and root-cause sessions run without a time budget or a closing debrief; grep confirms nothing equivalent exists. |
| 5 | **Breaking vs additive taxonomy** — spec/contract changes classified breaking/additive with migration notes | qa-api-contract-curator | spec-review amendments and code-review interface changes don't classify their blast radius; breaking ones deserve their own status. |
| 6 | UI-elements table (element/type/visibility/behavior) for frontend specs | spec-ui template | Verifiable shape for UI criteria in decompositor specs; today UI requirements live in prose. |
| 7 | Sanitization on delegation — scouts/subagents receive artifacts cleaned of secrets/PII | constraints template | secrets-guard watches the git boundary; nothing governs what leaves via subagent prompts. One line in the scout report contract. |

Lower-value (noted, not recommended now): link-status lifecycle automation (trace-audit
covers the symptoms), glossary term-consistency sweep, append-only closure of open
questions inside the spec line itself, observable-grouping of technical criteria,
priority-hierarchy override layer, customer-scheme→canon ID mapping.

## Stale-impact pass

- **Re-run** (existing tests whose subject the diff touches — all green on 8421c7e):
  full suite `node --test hooks/ scripts/` — 212 pass, 0 fail. [Must]
  spec-core.test.mjs and roles.test.mjs were updated *by* this diff (new field,
  generalized shared-list) — asserted strictly, not relaxed. [Must]
- **May now lie**: none found. The readGateConfig deep-equals gained exactly the new
  field on every existing case; no assertion was relaxed to a weaker match. [Must]
- **No longer covered**: none. The diff is additive everywhere; the only behavioral
  switch (mutation-guard) defaults off and carries its own tests. hooks-codex.json
  intentionally omits bash-policy for Codex — documented in docs/hooks.md host table,
  not a silent drop. [Should]

Recurring: none (first report for this topic).
