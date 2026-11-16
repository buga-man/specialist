# specialist

The repository is the **specialist** plugin: a full-cycle feature development framework
for **Claude Code**, **ZCode**, **pi agent**, **Codex CLI**, and **OpenCode** — from a raw task to
spec-driven code and up-to-date documentation. Skills are written once and work in every
host (the shared Agent Skills format); installation uses each host's native mechanisms,
and the skills can be used without installing the plugin.

## Pipeline

```
task → brainstorm → business spec
      business spec → system-thinking → system spec (repositories, contracts, rollout)
            system spec → decompositor → repo spec (files, patterns, tests, repo docs)
                  repo spec → implementation-plan → task plan (tasks for the agent)
                        task plan → spec-implementation → code (tests first, the spec as the oracle)
                              code → spec-review → acceptance (criterion by criterion, verdicts with evidence)
                                    unverifiable → stand-acceptance (live acceptance on the stand)

after merge / before release → tech-writer → docs audit (code ↔ specs, amendments via Amendments)
                                            + user manual (md → html + pdf, screenshots from the stand)

bugs → root-cause → reproduction → root cause → red test → minimal fix
      (risky fix → spec-review in a fresh session)

small tasks → fast lane → mini-spec + one-task plan (one artifact) → code → batch spec-review
      (profile `fast` in .spec-gate: stage skills — only on an explicit user request)
```

| Skill | Input → Output |
|---|---|
| `brainstorm` | raw task → business spec (no code; ≤10 questions, acceptance criteria, business cases) |
| `system-thinking` | business spec → system spec (which repositories change, contracts, blast radius; architecture changes are always explicit) |
| `decompositor` | system spec → repo spec (change sites, repo patterns, anchor snippets) |
| `implementation-plan` | repo spec → task plan for the agent (vertical slices, Verify "command → expected result", one task = one commit) |
| `spec-implementation` | plan → code (tests first, the spec as the oracle: spec > test > code; three-tier deviations; report: decisions, rulings, spec amendments) |
| `spec-review` | code → acceptance against the specs (criterion by criterion: passed/failed/unverifiable with evidence; best in a fresh session) |
| `root-cause` | bug report → root cause (reproduction required, red test, minimal fix, full suite) |
| `stand-acceptance` | acceptance on the project's live stand: login, token, API/UI in a browser, logs/DB, rebuild (sanitized placeholders) |
| `tech-writer` | code+specs → up-to-date specs and a user manual: code ↔ spec drift audit (amendments only via Amendments, after approval) + a manual `md → standalone html + pdf` with screenshots from the stand |
| `kb-index` | documentation corpus → `.kbindex/`: an index of document faces + directory maps, two-tier `kb.mjs search` (the "face" first, then BM25 over section bodies) with the `§<heading>:<line>` anchor, a `related`/`path` graph over links and relations; the gates in Claude Code, Codex, and pi do not release a turn with a stale index; `audit` reports broken links, orphans, and stale drafts |
| `codestyle` *(cross-cutting)* | repository conventions → `CODESTYLE.md`: rules with `file:line` evidence, anti-echo (regeneration only from code), generate/verify modes; the SessionStart hook reminds about staleness |
| `lazy` *(cross-cutting)* | a behavioral overlay for any coding: the minimal complete change, the reuse ladder, no deliberation loops |

Each spec is the contract input of the next skill; decisions are made and recorded at
the top, everything below only executes. Specs are living documents: deviations during
implementation travel up the chain (local ones — rulings in the report; behavior/contract
changes — a user-approved amendment to the spec via the Amendments section; a changed
intent — back to brainstorm), so the spec and the code never drift apart silently. The
routine loop of this upkeep is `tech-writer`: an audit of "code ↔ specs" over a commit
range and a rebuild of the user manual from the updated specs.

**Feature artifact navigation**: all specs, acceptances, and plans live in the target
repository's `docs/specs/` and `docs/plans/` and carry the topic slug from the business
spec — `YYYY-MM-DD-<topic>*` (`-implementation`, `-<repo>`, `-<repo>-review` for specs,
`<repo>` for plans). The whole chain of one feature is one glob away:
`ls docs/specs/*<topic>* docs/plans/*<topic>*`; in addition, the header of each spec
carries direct links to its parent specs. Spec YAML metadata (`id`/`parent`/`children`)
is bidirectional: the skill creating a downstream artifact immediately appends its id to
the parent's `children` (for multi-leaf system analysis — to the `children` of the
package's README page); `children: []` on a parent that has child documents is a
traceability defect — spec-review and tech-writer check for it.

## Structure

```
.claude-plugin/plugin.json       Claude Code plugin manifest
.claude-plugin/marketplace.json  marketplace wrapper (source: "./") — how /plugin install finds the plugin
plugin.json                      Codex agent-plugin manifest (Agent Plugins v1): points Codex at skills/ and hooks/hooks-codex.json
.zcode-plugin/plugin.json        ZCode plugin manifest: points ZCode at skills/ and hooks/hooks.json (ZCode speaks the Claude Code hook protocol, so the Claude Code adapters run unchanged)
package.json                     pi package manifest (pi.skills / pi.extensions)
skills/                          pipeline skills (the same ones for every host); each is self-contained — its CLI and domain cores live in skills/<name>/scripts/
hooks/                           the hooks: hooks.json registers them in Claude Code, hooks-codex.json in Codex; the shared cores and adapters live in hooks/lib/ — spec-gate (edits outside the plan — blocked), skill-gate (fast profile at skill invocation), secrets-guard (secrets at the git boundary — blocked), vuln-guard (semgrep on commit), edit-guard (after an edit: boundary notes, formatter, linter, opt-in semgrep — one adapter, one order), git-watch (a signal after tree-changing git operations), plan-context (plan context at session start), codestyle-reminder (stale CODESTYLE.md reminder), kb-gate (a Stop block on a stale documentation index); docs and contract — docs/hooks.md
extensions/                      the same rules for pi agent (TypeScript): spec-gate.ts, secrets-guard.ts, vuln-guard.ts, edit-guard.ts, plan-context.ts
plugins/opencode/                the OpenCode plugin (TypeScript, V2 API + a V1 server() fallback) — the same guards on the same cores
docs/                            documentation: skills, hooks, installation; design notes; the skill template
scripts/                         helper scripts: copy-skills.sh, compliance.mjs — the self-audit (`npm run compliance`): strict SKILL.md frontmatter, docs parity, generated docs/skill-index.md; skill CLIs live in the skill directories — skills/<name>/scripts/
```

## Hooks and extensions: one logic, five hosts

One logic (`hooks/lib/*.mjs` cores), four wrappers for five hosts: the Claude Code
adapters, shared verbatim with ZCode (which speaks the same hook protocol — the same
events, matchers, and `${CLAUDE_PLUGIN_ROOT}`), Codex adapters
(JSON output protocol, `apply_patch` support), pi extensions (`extensions/*.ts`), and the
OpenCode plugin (`plugins/opencode/`). Details and the plan contract:
[docs/hooks.md](docs/hooks.md); the pi extension
API — [extensions/README.md](extensions/README.md).

| Hook | When | What it does |
|---|---|---|
| `spec-gate` | before Edit/Write | blocks code edits outside the files of **open** tasks of a `docs/plans/` plan. Modes — the `.spec-gate` file at the project root: `soft` (default; active only with an active plan), `hard` (blocks code even without a plan — run the pipeline first), `fast` (the file gate as in `soft` + the process profile: fast lane by default), `off` |
| `skill-gate` | skill invocation (Skill) | in the `fast` profile blocks autonomous launch of brainstorm / system-thinking / decompositor — small tasks go through the fast lane (a mini-spec in the header of a one-task plan); an explicit user request — via temporarily switching the profile to `soft`; silent in the other modes |
| `secrets-guard` | before Bash | blocks `git add` of sensitive files (`.env`, keys, credentials; `git add .`/`-A`, bare directories and wildcard paths are checked against the index with untracked files expanded, quoted non-ASCII paths unescaped, `.env.example` is allowed) and `git commit`/`git push` with secrets in the diff (two pattern tiers: definite/likely; a push without an upstream — the first push of a branch — scans the commits the remote does not hold); legitimate fixtures — a regex in `.secrets-allow` at the root; a finding never echoes the secret's value; `git -C <dir>` is checked against the given directory |
| `vuln-guard` | before Bash (git commit) | semgrep over the commit's staged files — findings block; no semgrep on PATH — silent. `.vuln-guard` at the root: `always`/`edit` = scan edits too (inside edit-guard), `off` = the hook is fully off; false positives — `# nosemgrep:` / `.vuln-allow` |
| `git-watch` | after Bash | after tree-changing git operations (commit/checkout/merge/rebase/pull/reset/cherry-pick/stash pop) it reconciles derived artifacts with the disk: the kb-index index — a signal to rebuild (a data derivative), CODESTYLE.md — a signal to ask the user (the document is committed); silent when everything is fine |
| `edit-guard` | after Edit/Write | one adapter, one deterministic order: the boundary-visibility notes (an edit of a plan's `- Files:` scope line or of `.secrets-allow`/`.vuln-allow` is called out), the project's formatter (prettier / ruff), the project's linter (eslint / ruff / ktlint, each `--fix`-ing what it can), and — under `.vuln-guard = always` — a semgrep scan; unfixable errors and violations are returned to the agent to repair |
| `plan-context` | session start | injects a brief orientation into the context: the active plan, open tasks, the spec-gate mode; with the `fast` profile — also the profile block, even without a plan; with `.spec-gate` — an onboarding line about a missing `CODESTYLE.md` / kb-index index; with no open tasks — the spec-chain line: the newest incomplete chain in `docs/specs/`, its stage and the skill to resume with (derived from the slugs and `status:` metadata — no state file; no marker needed — a `docs/specs/` tree is itself the opt-in); silent at `off`, and in soft/hard when no chain is mid-flight and onboarding has nothing to report |
| `codestyle-reminder` | session start | if `CODESTYLE.md` sits at the root: counts code commits from the recorded `base` (the threshold — 30 code commits or 30 days) and injects a single reminder line; **never blocks**; the staleness verdict — `skills/codestyle/scripts/codestyle.mjs status` |
| `kb-gate` | Stop | reconciles the documentation index (`.kbindex/index.json`) with the disk by hashes: a document changed, appeared, or disappeared — the end of the turn is blocked with a rebuild command; without an index, at `stop_hook_active`, and on any error — silent |

All are fail-safe: a hook failure never blocks work. `docs/**` and `*.md` are always
editable under spec-gate. The plan contract — `docs/hooks.md`: sections
`### Task`, task files from `- Files:` (globs are supported; a
line whose paths cannot be parsed — a block with an explanation, not a silent opening;
a plan ending inside an unbalanced code fence — a warning, its swallowed tasks are
named), task closure — an explicit `- Done:` line (checkboxes `- [x]` are progress, not
closure; the plan template contains no `- Done:` line). The `.spec-gate` mode file is
also under the gate while a plan is open: the agent does not lift the gate itself, the
user changes the mode.

**The gates are discipline, not walls.** They catch the accidental — scope creep, a
leaked key, a broken format — not a determined agent: the plan and the
`.secrets-allow`/`.vuln-allow` allowlists are editable, and code can be rewritten
through `sed -i`. The system's answer is visibility: boundary edits produce notes
(edit-guard), and every such change lands in the git diff a reviewer reads. Boundaries:
no hook checks edit semantics against the spec — that is `spec-review`'s job; spec-gate
looks only at the target file and does not intercept edits made through Bash;
secrets-guard, by contrast, works precisely on Bash, but only on git commands (exotic
wrappers — pipes, `bash -c`, aliases — are a documented residual). The per-host
capability matrix: [docs/hooks.md](docs/hooks.md#host-support).

## Documentation

- [Installation and dependencies](docs/installation.md) — all five hosts and skills-only;
  what is needed for full operation, project configuration files, verification after installation.
- [Skills](docs/skills.md) — a human-readable description of all twelve skills: why they exist,
  input → output, when they trigger, key rules.
- [Hooks](docs/hooks.md) — all ten hooks and extensions: events, what they block,
  configuration, boundaries, and fail-safe behavior.
- [kb-index design notes](docs/kb-index-design.md), [codestyle design notes](docs/codestyle-design.md) —
  the design rationale behind the two skills.
- [Skill template](docs/skill-template/) — the starting point for a new skill.

## Installation

### Claude Code

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist@specialist
```

To try it without pushing: `/plugin marketplace add <local path to the repository>`.

### ZCode

The repository doubles as a ZCode plugin marketplace (ZCode supports
`.claude-plugin/marketplace.json`), and ZCode speaks the Claude Code hook protocol — the
same adapters run unchanged. In the ZCode app:

1. **Plugin Marketplace → Add → Add Plugin Marketplace** — paste the path to this
   repository.
2. **Personal → specialist → Install**.
3. The hooks register automatically; **Settings → Plugin Management** shows each hook and
   whether it is runnable. Plugin hooks run without a separate trust dialog.

Updating: the marketplace page's gear button → **Marketplace Sources** → refresh this
marketplace, then **Update** in the plugin details.

### pi agent

```bash
pi install git:github.com/buga-man/specialist.git
```

Updating: `pi update`. Pinning a version — by tag: `git:...specialist.git@v<release-tag>`.
After edits/extensions: `/reload` inside pi.

### Codex CLI

```bash
codex marketplace add https://github.com/buga-man/specialist.git
codex plugin add specialist@specialist
```

After installing, review and trust the hooks in the `/hooks` dialog (Codex runs
untrusted hooks only after explicit trust). Without the plugin, the skills work on their
own: `bash scripts/copy-skills.sh codex` (→ `~/.codex/skills`) or any target directory
(e.g. `.codex/skills` inside a project).

### OpenCode

In the target project's `opencode.json`:

```jsonc
{
  "skills":  ["<path to the specialist repository>/skills"],
  "plugins": ["<path to the specialist repository>/plugins/opencode"]
}
```

Both entries accept any path form (absolute, `~/`, `file://`). Without the plugin, the
skills work on their own: `bash scripts/copy-skills.sh opencode` (→
`~/.config/opencode/skills`); the compatibility sources `~/.claude/skills` and
`~/.agents/skills` are picked up automatically.

### Skills only, without installing the plugin

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist
bash scripts/copy-skills.sh claude   # → ~/.claude/skills (read by Claude Code and OpenCode)
bash scripts/copy-skills.sh pi       # → ~/.pi/agent/skills
bash scripts/copy-skills.sh agents   # → ~/.agents/skills (read by pi and OpenCode)
bash scripts/copy-skills.sh codex    # → ~/.codex/skills
bash scripts/copy-skills.sh opencode # → ~/.config/opencode/skills
```

Existing skills are not overwritten without confirmation. The target can also be an
arbitrary directory: `bash scripts/copy-skills.sh .claude/skills` (project-level skills).
In this mode hooks and extensions are **not** installed — skills only.

## How to add a skill

1. Copy `docs/skill-template/` to `skills/<skill-name>/`.
2. Fill in `SKILL.md`: `name` — matches the folder name (kebab-case, up to 64 characters);
   `description` — up to 1024 characters, the main autoload trigger ("what it does and
   when to apply it").
3. The skill must be portable — no machine-specific paths, credentials, or settings.
   Host-specifics: Claude Code and Codex hooks → `hooks/`, pi extensions → `extensions/`, OpenCode → `plugins/opencode/`.
   Skill scripts live in the skill's directory (`skills/<name>/scripts/`), paths in
   SKILL.md are relative (`<skill-dir>`); `${CLAUDE_PLUGIN_ROOT}` and other host
   variables are forbidden in SKILL.md.
   Command-and-project skills (like `stand-acceptance`, tied to a specific project's
   stand) are allowed — with an explicit scope in the description.
4. Test in the hosts you target: `npm test && npm run compliance` must pass (the
   compliance audit validates the frontmatter, the docs parity, and regenerates
   `docs/skill-index.md` via `--fix` when it is stale). Then bump the plugin version, and commit.

Skill discovery is recursive: a skill is any directory containing `SKILL.md`.

## How to add a hook

- **Claude Code** → `hooks/hooks.json` (event → matcher → command); shared logic — in
  `hooks/lib/`, the contract and examples — `docs/hooks.md`.
- **Codex** → the adapter in `hooks/lib/` (a `-codex` twin when the output protocol
  differs) + a matcher group in `hooks/hooks-codex.json`; the root `plugin.json` points
  Codex at it.
- **pi agent** → `extensions/<name>.ts`: `export default function (pi) { pi.on(...) }` —
  see `extensions/README.md`.
- **OpenCode** → `plugins/opencode/index.ts` (V2 `Plugin.define` + a V1 `server()`
  fallback) on the same cores.

## Versioning

- The plugin version is semver, kept in sync in every manifest field (enforced by
  `npm test`): `.claude-plugin/plugin.json`, `plugin.json` (the Codex manifest),
  `package.json` (the pi package), and the three version fields of
  `.claude-plugin/marketplace.json` (`metadata`, the plugin entry, the marketplace root).
  A new skill or hook — minor; an edit of a skill's text — patch.
- Stable points — git tags `v*` on the repository.

## Links

- The Agent Skills format (shared by every host): https://agentskills.io
- The Agent Plugins manifest (Codex): https://agent-plugins.org
- OpenCode documentation (skills / plugins): https://opencode.ai/docs
- Codex documentation (skills / hooks): https://developers.openai.com/codex
- pi documentation (skills / packages / extensions):
  https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs
- Claude Code documentation (plugins): https://code.claude.com/docs/en/plugins
