---
description: >-
  Specialist plan discipline for edits to plan and spec documents (docs/specs/**,
  docs/plans/**): plans are contracts, tasks close explicitly, roles switch only
  with the user's consent.
globs:
  - "docs/specs/**"
  - "docs/plans/**"
---

The specialist plan protocol applies to these documents (on Claude Code and ZCode the
same rules are blocking hooks; here they are discipline):

- A plan or spec is a contract with the user: change requirements or scope only with the
  user's explicit consent, and record the change in the document — never silently.
- Requirement markers are classes, not decoration: `(must)`/`(обязательно)` is blocking,
  `(should)`/`(желательно)`/`(опционально)` is negotiable, `Must-not:`/`Недопустимо:` is a
  prohibition; every must criterion carries `Verify:`/`Проверка:` — the exact evidence
  that decides it.
- A task section closes with an explicit `- Done:` line (evidence attached); `- [x]`
  checkboxes are progress, never closure. Never mark a task or a plan done without the
  verify evidence.
- Edit only the files the open task's `- Files:` line declares (the spec-gate extension
  blocks the rest on this host too); if the work outgrew the scope, amend the plan first,
  code second.
- If `.spec-gate` pins `role: <name>`, stay in that role; a switch needs the user's
  explicit consent (the `/role-*` commands are that consent on this host).
