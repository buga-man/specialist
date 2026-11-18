---
name: codestyle
description: Extract the repository's real code conventions into CODESTYLE.md — evidence-based rules a fresh-context agent can mimic. Two modes generate (full rebuild from code configs → git log → sampled files → verified rules) and verify (cheap staleness pass against recent commits). Use when the user asks to write, rebuild or refresh repo conventions ("codestyle", "code style document"), or when the plugin's session-start reminder says CODESTYLE.md may be stale. Not a linter — what lint configs already catch is referenced, never re-described; not a review skill.
---

# Codestyle

Write and maintain `CODESTYLE.md` in the repository root: the conventions this repo
actually follows, extracted from the code with evidence for every rule. The audience is
an agent executing a task with fresh context — it sees the task and the spec, but not
the repository; the document is how it writes code indistinguishable from the repo's
own. The document describes how this repo *writes* — never how it *should*.

## Hard rules

- **A rule without evidence does not exist.** Every rule cites `file:line` (or a commit)
  where the repo does exactly that. Nothing from imagination, nothing "typical for
  such projects".
- **Generate never reads the previous CODESTYLE.md.** The source is the code, always.
  Regenerating from the document turns it into an echo chamber: an invented rule, copied
  by people, "confirms" itself. (Verify reads it — it re-checks an existing document.)
- **Lint and format configs are the primary source.** What eslint / prettier / ruff /
  editorconfig / tsconfig already enforce goes into the Sources table and is **not**
  described in the body — a link, not a retelling.
- **CLAUDE.md / AGENTS.md are normative.** Their style sections are taken as authority,
  not re-derived. Two sources of truth about style are forbidden.
- **The ceiling is 150 body lines** after the frontmatter. Density beats completeness;
  when over the ceiling, cut the least frequent rules first. A long document is obeyed
  by no one — including models.

## Artifact

`CODESTYLE.md` in the repository root, committed, in the language of the repo's docs.
Frontmatter is the machine anchor for freshness (the session-start reminder and the
verify mode read it):

```markdown
---
codestyle: 1
generated: YYYY-MM-DD
base: <HEAD commit at generation time>
---
```

Section skeleton — order fixed, set grows with the stack:

```
## 1. Sources          aspect → config table (what is already enforced elsewhere)
## 2. Structure        where things live, directory naming, layer boundaries
## 3. Naming           files, functions, variables, constants, tests
## 4. Language idioms  what makes code "local" here (ESM vs CJS, async patterns, …)
## 5. Errors           how this repo signals and swallows failures
## 6. Tests            framework, location, style
## 7. Comments         density, language of code vs language of docs
## 8. Commits          message format from git log
## 9. Anti-patterns    "we don't write like this here" — each with an example
## 10. Agent readability  what serves the machine reader — file sizes, greppable names
```

Section 10 is for the repo's other reader — an agent that navigates by grep and reads in
capped chunks. The evidence there is measured, not sampled: the CLI reports the file-size
facts, and the constraints the repo actually meets get recorded (small files, unique
greppable names, why-comments that carry context). A constraint the numbers break is named
as an exception with the file and its size — a fact to know, never a rule to pretend.

A rule is one imperative line with its evidence:

- An imperative one-line rule — example: `path/to/file.mjs:12`.

A ❌ / ✅ pair only where the difference is visible at a glance; snippets are real,
taken from this repo, never invented.

## Mode: generate

Run when the document is absent or the user asks to rebuild. In order:

1. **Agent instructions and configs.** Find CLAUDE.md / AGENTS.md (normative), inventory
   the lint/format configs — a covered aspect leaves the body into Sources.
2. **git log** (~100 commits): the commit-message format and the touched files → a
   sample list weighted toward recent.
3. **Sample 15–25 files**: entry points, core, tests, scripts. Recent style wins a
   conflict with old style; a surviving contradiction becomes a module-local convention,
   not a global rule.
4. **Draft the rules**, each with its evidence. For section 10, measure instead of
   sampling:

   ```bash
   node "<skill-dir>/scripts/codestyle.mjs" scan
   ```

   The JSON carries the code-file count, the largest file, and the oversized list — cite
   those numbers as the evidence; names and comments there are verified by grep
   spot-checks like any other rule.
5. **Verify against a held-out sample** — files that were NOT in the sample. A rule the
   held-out files contradict is deleted or marked module-local. This pass is the
   anti-hallucination gate: a rule without a real example does not survive it.
6. **Write and commit**: `base` = current HEAD, `generated` = today.

## Mode: verify

The cheap pass — normally as a reaction to the session-start reminder:

1. Read the verdict; the CLI is the single source of truth on staleness:

   ```bash
   node "<skill-dir>/scripts/codestyle.mjs" status
   ```

   <skill-dir> is the directory of this SKILL.md — the host reports it when the skill loads; resolve the path from there.

   `{"doc":"missing"}` → offer generate. `{"doc":"broken"}` → fix the frontmatter first.
   `"git":false` → freshness is unknown: report that, do not guess.

2. Walk the rules against the commits since `base`: update the evidence that moved,
   delete rules the code stopped following, add rules for a new dominant pattern —
   each with fresh evidence. For section 10, re-run `scan`: the numbers age with every
   commit that adds or splits a file.
3. Do not rewrite the document — report the outcome: "24 rules: 22 confirmed,
   1 updated, 1 removed".
4. Commit with bumped `generated` and `base` = current HEAD.
