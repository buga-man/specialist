# Review: feat/omp (0.42.0) — quality & correctness of the oh-my-pi support

Branch `feat/omp` (2d38fb9) against `main` (22e3401): one commit, 19 files, +218/−71.
The change adds oh-my-pi (omp, a pi fork) as the sixth host: a per-host fork in
kb-gate's settle wiring, the `omp` manifest twin key, the `omp` skills-only target,
and the doc trail (README, docs/installation.md, docs/hooks.md, extensions/README.md).
A rider outside the omp scope: skill-size's byte budget counts LF-normalized text.
The external claims (omp events, the `session_stop` result contract, the manifest
keys, the skills directories, the reload command) were verified against omp's sources
and docs (`can1357/oh-my-pi`, omp.sh) before and during this review.

Re-verified: no predecessor `*-quality` report for this topic (the first omp change).

**Outcome: worth a pass** — three worth-fixing findings, all doc/wiring precision, no
blockers; the host-fork design itself held up under source verification (the return
contract, the flat-extensions scan, and the manifest precedence are all confirmed in
omp's code). Fixed in the follow-up commit; the re-read found nothing new.

**Converged: pass 1** — after the fixes below, the re-read yields zero blockers and
zero worth-fixing findings.

## Change map

**Heart** — `extensions/kb-gate.ts`: the change's intent lives here (one gate, two
settle wirings). **Consequences** — `package.json` (the `omp` twin key omp's loader
prefers: `pluginPkg.omp || pluginPkg.pi`), `scripts/copy-skills.sh` (the `omp` target),
and the four documents that carry the omp claims. **Glue** — the five version bumps,
the regenerated `roles/` manifests, `scripts/skill-size.mjs` + its test (the CRLF
rider). Not reviewed: none.

## Findings

| # | Location | Class | Severity | Direction |
|---|---|---|---|---|
| 1 | `extensions/kb-gate.ts` (omp branch) | duplication / error idioms | worth fixing | The manual `continuing` latch duplicates a signal the host already provides: omp's `SessionStopEvent` carries `stop_hook_active` (set true exactly on the settle that follows a hook-forced continuation, reset when a settle schedules none — verified in `agent-session.ts#emitSessionStopEvent`) plus the settle's abort `signal`. Two sources of truth for one state; and the branch checks no abort signal where the pi branch checks `event.aborted`. Read `event.stop_hook_active` and `event.signal.aborted`, keep the latch only in the pi wiring (whose event names no such flag). |
| 2 | `docs/installation.md` (omp section), `extensions/README.md:53` | accuracy | worth fixing | Both tell the omp user to run `/reload` — omp names the command `/reload-plugins`, and per its own docs a changed extension module needs a session restart (`/reload-plugins` refreshes skills/commands/agents live; extension modules load per session). Split the line per host. |
| 3 | `README.md` (structure block, package.json row) | accuracy | worth fixing | "the same omp section" implies `omp.skills` parity, but omp's `PluginManifest` reads `tools/hooks/extensions/commands/features/settings` — no `skills`; the skills tree is found via the conventional `skills/` directory scan. Only the `extensions` field is load-bearing for omp. Say so; keep the key (inert, mirrors pi). |
| 4 | `docs/hooks.md` (kb-gate omp paragraph) | precision | note | "the same one-continuation fuse" undersells a verified fact: omp names the fuse `stop_hook_active`, like the Claude hook the gate twins. Name it. |
| 5 | PR #26 body | accuracy | note | The "why not agent_end" paragraph garbles its own argument ("omp lacks session_stop's predecessor"). Restate: omp's own stop-hook analog uses `agent_end` because omp's extension-level events stop at `agent_end`; the blocking `session_stop` is the closer twin of the Claude Stop contract. |
| 6 | commit 2d38fb9 message ("red-ned") | typo | note | Won't fix: append-only history, a force-push for a typo is not a trade. |

## Quality & logic pass — what held

- **The host fork** — the load-bearing external facts all verify in omp's sources: the
  `session_stop` handler result `{ decision?: "block"; reason?: string }` is consumed
  as "Claude/Codex-compatible", `reason` becomes the hidden continuation message, and
  explicit blocks bypass the 8-continuation advisory cap (`agent-session.ts`,
  `shared-events.ts`); flat `extensions/*.ts` files load through the directory scan
  (`isScanFile: isModuleFile`); the manifest precedence `omp || pi` makes the twin key
  safe while pi keeps reading its own; `~/.omp/agent/skills` is the native user skills
  directory. The probe set (omp-only `ExtensionAPI` members) holds against both API
  surfaces: every probed member exists in omp and none in pi.
- **Not `agent_end`** — upstream pi does carry `agent_end`, but it closes one low-level
  run (retries, compaction, steering may follow; `agent_settled` is the settle
  boundary — pi's own `docs/json.md`). Dual registration would fire the gate mid-run
  in pi and spend its one-continuation fuse early. omp's `session_stop` is strictly
  the closer twin of the Claude Stop contract.
- **The CRLF rider** — `budgetFindings` normalizes before both counts; the byte-exact
  existing test feeds LF text (normalization is identity there), so nothing it pinned
  moved. Line counts are identical under both endings.
- **Fail-safe posture** (CODESTYLE §5) — both branches stay silent on internal errors;
  a probe miss degrades to the pi wiring, whose event never fires on omp (inert, not
  wrong); a wrong block remains impossible (omp's operator-interrupt override, pi's
  `aborted` check, omp's `signal.aborted` after finding #1).

## Stale-impact

- **Re-run** — `scripts/skill-size.test.mjs` (its subject, `budgetFindings`, is
  touched by the rider): green — Must.
- **May now lie** — none: the byte-exact assertion is fed LF text, which the
  normalization leaves untouched; the added CRLF test pins the equivalence itself.
- **No longer covered** — none: no test deleted, no assertion weakened (721 tests
  before the fix commit, 721 after).

## Set-aside

- `omp.skills` kept in the manifest though omp ignores it today — deliberate: it
  mirrors the pi twin, is inert data, and documents intent; finding #3 fixes the doc,
  not the key.
- The commit-message typo (finding #6) stays — history is append-only.
- pi's own behavior for a flat `extensions/` directory was not re-verified in this
  review (pre-existing, outside the diff; omp's scan semantics were, since they are
  new ground).

Recurring: none (no predecessor report for this topic).
