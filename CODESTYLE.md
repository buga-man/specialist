---
codestyle: 1
generated: 2026-11-16
base: 0531468dcde6232c8416203663b1f08f4d85ac0e
---

# CODESTYLE — how this repository is written

The document describes how code is *written here*, not how it *should be*: every rule
comes with a place in the code where the repository does exactly that. The audience is an
executor with fresh context.

## 1. Sources

There are no style-enforcement tools: no `.editorconfig`, no eslint/prettier/ruff, and no
agent `CLAUDE.md`/`AGENTS.md` in the repo. Discipline is held by the repository's own
hooks (`hooks/`), the tests, and this document. If such a config
appears, its aspect moves out of the document into that table.

## 2. Structure and modules

- Shared logic lives in a pure core without I/O; the file and git layer is a separate
  `*-fs.mjs` file (`skills/kb-index/scripts/lib/kb-fs.mjs:1` — "Everything the pure core
  must not do"); thin adapters are `hooks/lib/<hook>.mjs` (CC) and
  `extensions/<hook>.ts` (pi). Examples: `hooks/lib/kb-gate.mjs:18` (the adapter imports
  the core from the skill's directory), run injection instead of I/O —
  `hooks/lib/lint-core.mjs:68`.
- A skill is self-contained: its CLI and domain cores live in the skill's directory —
  `skills/<skill>/scripts/` and `skills/<skill>/scripts/lib/`; example:
  `skills/kb-index/scripts/kb.mjs`. A hook adapter imports the core from the skill's
  directory.
- A skill is a directory `skills/<name>/SKILL.md`; the directory name = the `name` field.
- Tests sit next to the file under test: `<file>.test.mjs`.

## 3. Naming

- Files — kebab-case: `secrets-core.mjs`, `build-manual.mjs`.
- Cores: named exports; `export default` only for pi extensions
  (`extensions/spec-gate.ts:20`).
- Functions — verbs or role nouns: `decide`, `readMode`, `parseFrontmatter`.
- Test names — sentences with a colon: `test("hook: no index — silence")`
  (`hooks/lib/kb-gate.test.mjs:47`).

## 4. Idioms

- ESM (`.mjs`), imports only with the `node:` prefix; zero npm dependencies across the
  whole repo (`package.json` — scripts and manifests only).
- Processes: `spawnSync` with an **array of arguments**, `encoding: "utf8"`,
  `windowsHide: true` (`hooks/lib/kb-fs.mjs:30`, `hooks/lib/hook-kit.mjs:34`).
- Paths are always posix: `split("\\").join("/")` (`hooks/lib/kb-fs.mjs:58`).
- CLI output goes through `Buffer.from(text, "utf8")`, not `console.log`:
  `scripts/kb.mjs:55` (independent of the Windows console encoding).
- Glob examples in comments are written in words: `*/` and `**/` inside a block comment
  would close it and break the module (`hooks/lib/spec-core.mjs:11`).

## 5. Errors and fail-safe

- A hook error never blocks work: `try { … } catch { }` → exit 0
  (`hooks/lib/kb-gate.mjs:41`). In a core, a read/parse error is read as "I know nothing":
  `null`, a default, an empty result (`hooks/lib/spec-core.mjs:34`).
- Blocking is only explicit and with an explanation of the way forward: exit 2, the reason
  on stderr (`hooks/lib/kb-gate.mjs:36`).
- The CLI exit-code map: 0 — success, 2 — a usage error (usage without a stack trace),
  1 — a runtime error (`scripts/kb.mjs:18`). A tool finding is signaled by its JSON, not
  the exit code: `hooks/lib/vuln-core.mjs:148`.

## 6. Tests

- `node --test` + `node:assert/strict`, no mocks: cores are pure functions over data;
  adapters spawn the real script over a temp repository
  (`hooks/lib/kb-gate.test.mjs:38`; real git — `hooks/lib/codestyle-reminder.test.mjs:26`).
- Temp directories: `mkdtempSync` + cleanup in `process.on("exit")`
  (`hooks/lib/kb-gate.test.mjs:17`).
- A regression of new behavior is captured by a test in the same commit.
- A new or heavily rewritten skill is proven in a clean room before release: a fresh
  agent session that sees only its SKILL.md, a scratch folder outside this
  repository, a real task from the skill's domain. Judge what the agent does, not
  what the text says — a skill is instructions an agent executes, and only the
  execution is the test (live precedent: the 0.38.0 scouts fan-out found 12 wording
  fixes before the release). The run audits the negative too: findings the skill
  produces that a senior would not act on are false positives, and they land in the
  skill's known-false-positives list — the list grows from measurement, not from its
  author's expectations (filed under three states: false positive / real miss /
  right signal, wrong weight). The bar itself is an observed failure: a new skill
  clears it with a real session that went wrong — what was run, what the skill would
  have changed, what it cost; "it would be better if" does not clear the bar. A
  candidate composable from existing skills does not get a new skill — every skill is
  permanent maintenance surface.

## 7. Comments and language

- Every `.mjs` opens with a JSDoc header: the contract, who consumes it, the fail-safe
  policy (`hooks/lib/spec-core.mjs:1`).
- Code and JSDoc are in English; usage and CLI messages, test names, and documentation
  (`docs/`, `README`) are written in the team's working language.

## 8. Commits

- `type(scope): message` — the message is written in the team's working language:
  `feat(kb-index): CLI build|search|map|audit|clean`;
  types: feat / fix / docs / chore. Merge commits are in English, as git writes them.
- A new skill or hook — a minor version bump; an edit of a skill's text — a patch. The
  version changes synchronously in four files: `.claude-plugin/plugin.json`, `plugin.json`,
  `package.json`, and `.claude-plugin/marketplace.json` (README → "Versioning").

## 9. Anti-patterns

- ❌ A state file for session state — derive state from git/disk; agent edits and
  `git pull` are indistinguishable to a file. Evidence: `hooks/lib/codestyle-fs.mjs:1`,
  `hooks/lib/kb-fs.mjs:1`.
- ❌ Regenerating an artifact from its previous version (an echo chamber): the source of
  truth is the code/files; the derivative is rebuilt from scratch. Evidence:
  `docs/skills.md` (kb-index: "add the intro paragraph to the document, not to the index").
- ❌ Silent pass-through on unparseable data: if it did not parse — block with an
  explanation of the format, not a silent skip (`hooks/lib/spec-core.mjs:314`).

## 10. Agent readability

- Code files stay within one capped agent read — 80 of 83 under 500 lines
  (`skills/codestyle/scripts/codestyle.mjs scan`, 2026-11-16). The exceptions are all in
  kb-index — `skills/kb-index/scripts/lib/kb-core.mjs` (1197),
  `skills/kb-index/scripts/lib/kb-core.test.mjs` (627), `skills/kb-index/scripts/kb.mjs`
  (546): read them in chunks, do not split unprompted.
- SKILL.md files stay within one capped read — every one under 220 lines and 13 KB
  (`scripts/skill-size.mjs` in npm test, 2026-11-20): a skill loads whole into the
  session on every use, and one that grows with every release dilutes the attention
  its own instructions get. A skill that outgrows its cap moves detail into
  `references/` (precedent: `skills/brainstorm/references/`).
- Why-comments carry provenance and survive refactors: a dated decision record
  (`hooks/lib/vuln-core.mjs:9` — "Design decisions (agreed 2026-11-08)"), the reason a
  workaround exists (`skills/codestyle/scripts/lib/codestyle-core.mjs:103` — the local-date
  note). Deleting one is losing the reason the code looks like this.

## 11. Writing for agents

The doctrine for the repository's agent-facing prose — SKILL.md files, hook block
messages, docs. tech-writer is its scribe; the versioning rule of §8 applies.

- **Two loads, one budget**: context load — the tokens a document always spends;
  cognitive load — which documents exist and when to reach for each (the human is the
  index). The caps in §10 price the first; a navigable docs tree prices the second.
  Neither is "minimized": they are the price of the document working.
- **The disclosure ladder**: an in-file step, an in-file reference, a disclosed
  reference (`skills/brainstorm/SKILL.md` → `references/ears-patterns.md`; detail
  moving out of a capped skill, §10). The test for going down a rung is branching:
  inline what every branch of the flow needs; put behind a pointer what only some
  branches reach.
- **Completion criteria carry clarity and demand**: a vague bound invites premature
  completion — sharpen the bound before splitting the document. Demand does the
  forcing: "a pass with zero failed criteria and zero actionable deviations is
  terminal" (`skills/spec-review/SKILL.md`) makes the reviewer re-verify instead of
  re-skim; "every remaining element is load-bearing" (`skills/root-cause/SKILL.md`)
  makes minimization finish.
- **Prompt the positive**: a prohibition drags the forbidden behavior into context and
  makes it more available — steering leads with the desired action, and a block names
  the way forward (`hooks/lib/kb-gate.mjs:36` — exit 2 with the reason and the rebuild
  command, not a bare refusal).
- **The no-op test**: a line that does not change what the executor does is deleted —
  settled by running the document against the default behavior, not by debate. The
  test is model-relative: does *this* executor behave differently without the line?

## 12. Authoring skills

The doctrine for writing the skills themselves — the input to §6's clean room.

- **Baseline first**: watch an agent attempt the skill's task WITHOUT the skill and
  name the failure that was seen — a skill written against an imagined failure teaches
  the wrong thing; the clean-room run then proves the delta, not the intent.
- **Match the form to the failure**: a discipline violation takes a prohibition plus
  the rationalization table; a wrong output shape takes a positive recipe; an omitted
  element takes a structural slot; conditional behavior takes an observable predicate.
  A prohibition aimed at a shaping problem measurably produces more of the unwanted
  behavior than no guidance at all — the form is chosen from the observed failure, not
  from taste.
- **No nuance clauses**: "don't X unless it matters" reopens the negotiation the rule
  closed — state the rule and name the exception's owner instead.
- **Regex-enforceable → automate**: if a check can be a script, it is a script (the
  hooks and the `scripts/` gates own the mechanical); documentation holds only judgment.
- **Self-evaluation is not evidence**: "did you violate any rules?" always answers no.
  A gate demands the concrete artifact — the file list, the command output, the
  importer grep — because the investigation itself is what changes the answer.
