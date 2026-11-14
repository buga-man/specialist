# codestyle — CODESTYLE.md: repository conventions for the agent

The skill and the hook are part of the `feature-mastering` plugin. No separate plugin is created.

## 1. Rationale

Spec-pipeline executors work with fresh context: the task plus the repo spec (`implementation-plan` is written for an "executor with fresh context holding only that task and the repo spec"). Such an agent does not see the repository as a whole, yet `implementation-plan/SKILL.md` already promises: "Small implementation choices are made by repo conventions" — with no mechanism to deliver those conventions to the executor.

The `codestyle` skill closes the gap: it studies the repository, extracts **evidence-backed** conventions, and writes `CODESTYLE.md` to the target repository's root. The consuming skills (`implementation-plan`, `spec-implementation`, `spec-review`) reference the document; the `SessionStart` hook reminds when the document is stale.

The point is mimicry: the agent's code is indistinguishable from the repository developers' code.

## 2. Scope

**Goals.** A formalized, evidence-checkable conventions document: naming, structure, idioms, errors, tests, commits. One document per repository. Two modes: full generation and a quick freshness check.

**Non-goals.** Not a linter and not a formatter: everything the configs catch (eslint, prettier, ruff, editorconfig) is **not described** in the document — only a link to the config. Not prescriptive: the document describes how code is *written here*, not how it *must be*. Not a fix of existing code and not a review.

**Descriptiveness is a hard rule.** A rule without evidence in the code is not recorded. Regeneration always goes from the code, **never** from the previous `CODESTYLE.md` — otherwise the document becomes an echo chamber: the agent invented a style, people copied it, the document "confirmed" it.

**Relationship with CLAUDE.md / AGENTS.md.** If the repo already has agent instructions with style sections — they are the normative source, and the document **references** them instead of re-deriving the same thing. Two sources of truth about style are unacceptable.

## 3. The artifact

`CODESTYLE.md` at the target repository's root, committed (a team artifact, not an agent-session artifact — developers can edit it manually, there is no desynchronization with agent sessions). Location — by the repo's own convention, the default — the root. The document's language is the repository's documentation language: the document itself mimics too.

The frontmatter is a machine anchor for the freshness check (and compatible with the `kb-index` index):

```markdown
---
codestyle: 1
generated: 2026-11-10
base: a1b2c3d4
---
```

`base` — HEAD at generation time; the hook counts commits from it. `schema: 1` — format versioning, as in `kb-index` §13.

### The section skeleton (universal, the order is fixed)

1. **Sources** — an "aspect → config" table: what linters and formatters already catch (formatting, imports, indentation). These aspects are not covered by the document.
2. **Structure and modules** — what lives where, how directories are named, layer boundaries.
3. **Naming** — files, functions, variables, constants, tests.
4. **Language idioms** — what makes the code "local": ESM vs CJS, array handling, async patterns.
5. **Errors and fail-safe** — how the repo handles and signals errors (in this repo, for example: exit 0 as fail-safe, exit 2 + stderr as a block).
6. **Tests** — the framework, location, style (pure functions without I/O, `node --test`).
7. **Comments and language** — density, the code's language vs the documentation's language.
8. **Commits** — the message format from git log.
9. **Anti-patterns** — "we do not write like this here", each with an evidence example.

### Rule format

```markdown
- A one-line imperative rule — evidence: `path/to/file.mjs:12`.
```

A `❌ / ✅` pair — only where the difference is visible at a glance; snippets are real, from the repo. The ceiling is **150 lines of body** after the frontmatter. The document is a mimicry mask, not an encyclopedia: nobody follows a long one, the model included. Density beats completeness; on overflow the least frequent rules are cut.

## 4. Generation method

The skill is an LLM instruction, not a script: the agent does the gathering and sampling. Only the freshness check stays a script (§6).

1. **Agent instructions and configs.** Find `CLAUDE.md` / `AGENTS.md` — style sections from there are taken as normative, not derived. Inventory the configs: `.editorconfig`, `eslint*`, `.prettierrc*`, `biome*`, `tsconfig*`, `pyproject.toml`, `ruff*`, `cargo.toml`, `checkstyle*`, etc. — an aspect covered by a config goes to the "Sources" section and disappears from the body.
2. **Git log** — the last ~100 commits: the message format, touched files → a sample list weighted toward recent ones.
3. **Sampling** — a bounded set (~15–25 files): entry points, core, tests, scripts. Weighted toward recent: code evolves, **the recent style is the real convention**. Old vs new conflict — the new wins; a contradiction is recorded as a module-local convention, not a general one.
4. **Rule draft** — each rule with evidence (`file:line` or a commit).
5. **Verification** — each rule is checked against a held-out sample (files **not** in the sample). A rule contradicting the sample → removed or marked local. This is the anti-hallucination pass: a rule without an example does not survive it.
6. **Write** — frontmatter `base` = current HEAD, commit.

## 5. Two modes

- **generate** — the full §4 method. The document is absent or the user asks to "rebuild".
- **verify** — a quick check: `codestyle.mjs status` (§6), then the rules are reconciled with recent commits; evidence is refreshed, stale rules removed. The document is not rewritten from scratch — a report like "24 rules: 22 confirmed, 1 updated, 1 removed". Orders of magnitude cheaper than generate; invoked after the hook's reminder.

## 6. The freshness check

**The event — `SessionStart`.** The staleness condition is repo state, not an event: "N code commits since `base`". It is derived entirely from git history, so no state file is needed (the same logic as kb-index §8 against `PostToolUse` + `state.json`: session-scoped state confuses agent edits with `git pull`).

**Why not a blocking `Stop`.** kb-index blocks because a hash mismatch is a *proven* index error the agent can fix with one command. codestyle staleness is *possible* outdatedness: whether to regenerate is the user's call. Blocking over something the agent cannot cheaply fix is disproportionate. The hook **does not block**: exit 0, one line into the context.

**The math** (`codestyle-core.mjs`, pure functions):

```
base = the document's frontmatter
total = git rev-list --count base..HEAD
files = git diff --name-only base..HEAD
codeCommits = commits touching ≥1 file that is not *.md and not CODESTYLE.md itself
stale = codeCommits ≥ 30 OR days(base) ≥ 30
```

The "not markdown = code" heuristic is deliberately crude: precision is not needed here, the cost of a false positive is one reminder line.

**Behavior:**

| Situation | Reaction |
|---|---|
| no `CODESTYLE.md` | silence (in a repo without the document the hook does not exist) |
| `codeCommits < 30` and fresh | silence |
| stale | one line: "CODESTYLE.md may be stale: N code commits since <date>. Check: `codestyle.mjs status` / `/codestyle verify`" |
| broken frontmatter, no git, any error | exit 0, silence (fail-safe as in every gate of this repo) |

**CLI** — `scripts/codestyle.mjs status`: prints the verdict as JSON (`{stale, codeCommits, days, base}`); the skill's verify mode uses the same call — a single source of truth about "stale or not", not a formula buried in instruction prose.

**Mechanics** — as in kb-index §8: `CLAUDE_PROJECT_DIR` → otherwise `git rev-parse --show-toplevel`; Windows — `spawnSync` with an argument array, paths via `/`, UTF-8 explicit.

## 7. Pipeline integration

Three points, all with an optional input (the document may be absent; consumers keep working):

- `implementation-plan` §4: "Small implementation choices are made by repo conventions" → "…made by CODESTYLE.md when present; when absent, note it in the plan — conventions are not formalized".
- `spec-implementation`, Inputs: `CODESTYLE.md` next to the specs, if present.
- `spec-review`: the checklist item "code conforms to CODESTYLE.md" — mimicry is checked where behavior is.

The hook is not part of the pipeline: it works in any project with the plugin installed where the agent writes code, not only in the spec flow.

## 8. Layout

```
feature-mastering/
├── hooks/
│   ├── hooks.json                  # + a SessionStart section
│   └── lib/
│       ├── codestyle-core.mjs      # frontmatter, code-commit counting, the verdict
│       ├── codestyle-core.test.mjs
│       └── codestyle-reminder.mjs  # SessionStart: count, inject, or stay silent
├── scripts/
│   └── codestyle.mjs               # CLI: status
├── skills/
│   └── codestyle/
│       └── SKILL.md                # generate + verify
└── docs/
    └── codestyle-design.md         # this document
```

The core is pure functions without I/O, reused by the hook and the CLI, tested with `node --test` and no mocks (a repo convention). No generation script is needed: the LLM does the analysis.

## 9. Boundaries and risks

- **Hallucinated conventions** — the main risk. Two defenses: a rule without evidence is not recorded (§2) and verification against a held-out sample (§4.5).
- **Echo chamber.** Regenerating from the previous document cements what was invented. Defense: the source is always the code; in generate mode the previous document is not read at all.
- **Staleness.** The hook catches it by commit count; if the agent never reaches the end of the session, the reminder arrives at the next `SessionStart`. Losing it inside a long session is an acceptable price for a non-blocking hook.
- **Style conflict in a repo.** Old vs new — the new wins (§4.3); sporadic exceptions are not a rule.
- **Large repos.** Sampling is bounded; the document describes the dominant convention, not every module.
- **Two sources of truth.** `CLAUDE.md`/`AGENTS.md` take priority; the document references them (§2).

## 10. Acceptance criteria

1. **Self-test on this repository** — the first generation subject: `CODESTYLE.md` holds rules, each with evidence, and we can verify them by eye (conventional commit messages, `node --test`, exit 2 + stderr, pure I/O-free cores — known truths the document must reproduce).
2. **verify on a fresh document** — "everything confirmed", the time noticeably less than generate.
3. **Hook:** `base` rewound by 30+ code commits → at `SessionStart` one reminder line appears in the context; a fresh document — silence; no document — silence; no git — exit 0.
4. `node --test` green: frontmatter parsing, the "not markdown = code" filter, the commit counter, the verdict thresholds.
5. Registration: `codestyle-core.test.mjs` into the root `package.json`'s `test` script; the plugin versions in `feature-mastering/.claude-plugin/plugin.json` and the root `.claude-plugin/marketplace.json` in sync; `docs/hooks.md` and `docs/skills.md` updated — skipping is not allowed (they list all hooks and skills).
6. Consumers updated (§7): `implementation-plan`, `spec-implementation`, `spec-review`; without the document their behavior does not change.

## 11. Developer decisions

- The file's name and location (`CODESTYLE.md` at the root — the default; a repo with its own convention wins).
- The staleness thresholds (30 code commits / 30 days — hook constants; a `.codestyle.json` config only when two different repositories ask for it, not earlier).
- The section skeleton's composition (the order is fixed, the set grows with the stack).
- A twin pi extension — the same answer as in kb-index §15: the "core + wrappers" scheme is portable, but writing blind before `pi` is confirmed is not worth it.

## 12. Work order

1. `codestyle-core.mjs` + tests — the freshness math, no hook or CLI.
2. `scripts/codestyle.mjs status` — a CLI over the core.
3. `skills/codestyle/SKILL.md` — generate + verify.
4. `codestyle-reminder.mjs` + a `SessionStart` section in `hooks/hooks.json`.
5. Integration with the consumers (§7).
6. Registration and repository documentation (§10.5).
7. Self-test: generate on this repo, verify, a manual rule check against §10.1.

Every step leaves a working result: after step 3 the skill can already be run by hand, before the hook is wired.

## 13. Update 2026-11-14 — skill self-sufficiency

The §8 implementation was adjusted: the skill's CLI and cores moved into its directory —
`skills/codestyle/scripts/codestyle.mjs` + `skills/codestyle/scripts/lib/` (codestyle-core,
codestyle-fs; `gitRoot` is inlined instead of being imported from kb-fs). The skill works without the
plugin installed, in any harness; the hook adapter `hooks/lib/codestyle-reminder.mjs` stayed in place
and imports the core from the skill directory. Paths in SKILL.md are relative (`<skill-dir>`),
`${CLAUDE_PLUGIN_ROOT}` is forbidden in skills (the rule in docs/skill-template).
