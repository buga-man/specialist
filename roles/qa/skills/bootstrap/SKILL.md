---
name: bootstrap
description: Set a repository up for the specialist framework — survey what exists, propose what is missing, create it with the user's confirmation. The .spec-gate config (mode and guards), docs/specs/ and docs/plans/, CODESTYLE.md via codestyle, an optional .suite-gate test command, the kb-index index. Existing documentation migrates into the structure under one rule — port the content, never rewrite its meaning. Use when the user asks to set up, initialize, or onboard a repository for the framework.
---

# Bootstrap

One skill, one job: make a repository ready for the framework — the config files the
hooks read, the directories the pipeline writes to, the conventions document the
executor mimics. Everything is created only after the user confirms it; nothing
existing is overwritten. Running it twice changes nothing the second time.

## Flow

```
1 survey the repository → 2 propose the gap list → 3 create the confirmed pieces
→ 4 migrate existing docs (pilot first) → 5 report & next steps
```

## 1. Survey the repository

Read-only pass; report findings as facts:

- git repository, current branch, clean/dirty tree;
- `.spec-gate` (present? mode? role pin? guards?), `.suite-gate`, `.secrets-allow`,
  `.vuln-guard`/`.vuln-allow`, `CODESTYLE.md`, `.kbindex/`;
- `docs/` structure: `docs/specs/`, `docs/plans/`, existing specs and reports (the
  slug convention `YYYY-MM-DD-<topic>*`), other documentation trees;
- the project's test command (package.json scripts, Makefile, CI config) — the
  candidate for `.suite-gate`.

## 2. Propose the gap list

Every missing piece is proposed with one line of why, and the user confirms each
class before anything is written:

| Missing | Proposal |
|---|---|
| `docs/specs/`, `docs/plans/` | create empty (with a one-line README naming the conventions — slugs, `- Files:` lines) |
| `.spec-gate` | `mode: soft` unless the user picks otherwise (`hard` for greenfield discipline, `fast` for a small-task repo); guards stay off until asked |
| `CODESTYLE.md` | offer the `codestyle` scan now or later (later is fine — the reminder hook nags honestly) |
| `.suite-gate` | propose the detected test command; the user owns the final line |
| kb-index | offer to build `.kbindex/` when a documentation corpus already exists |

An existing piece is never re-created — its current content is echoed back in one
line so the user sees what the framework will read.

## 3. Create the confirmed pieces

- Exactly the confirmed items, exactly once; a failed write is reported, not retried
  silently.
- No commits — files land in the working tree; committing is the user's command.

## 4. Migrate existing documentation — port, never rewrite

When the repository already carries specs or design docs outside the structure:

- **The source is primary until the migration is accepted.** Content is moved, not
  improved: no rephrasing, no new requirements, no gaps filled in, no scenarios
  invented — an agent "improving" legacy docs while moving them destroys information.
- Empty or missing sections become `Requires filling in` — never prose.
- **Pilot first**: one document migrates, the user reviews it, and only then the rest
  run under the same rules. A migration the user has not seen is a rewrite wearing
  a badge.
- Frontmatter (`id`, `parent`, `children`, `status`) is added around the ported
  content, linking the family together — metadata is scaffolding, not content.
- Migration is a one-time mode, not a permanent one: when it ends, new docs are born
  in the structure.

## 5. Report & next steps

- What was created, what was left alone and why, what the user still owes a decision
  (mode choice, the suite command, the pilot review).
- The next step for actual work is `dispatch` — classify the first task by role. The
  bootstrap ends here; it does not start features.

## Rules

- **Idempotent**: a second run finds everything present and creates nothing.
- **Confirm before create** — each piece is the user's decision; the survey proposes,
  the user disposes.
- **Never overwrite**: an existing file is diffed in the proposal, and only the user
  applies the change.
- **No commits, no pushes** — outward operations run on the user's explicit command.
- Write the report in the team's working language, which may differ from the language
  of this skill.
