# Draft a WATCHDOG.yml advisor roster

Generate a WATCHDOG.yml for this project in the specialist style, then show it to the
user for review — do not write the file without consent:

- `spec-guard` — reviewMode: turn, scope: main. Watches every turn against the open plan
  (docs/plans) or spec (docs/specs): out-of-scope edits, silently closed tasks, criteria
  drift. Instructions: compare the turn's file changes with the open task's `- Files:`
  list and its acceptance criteria; note every deviation with the plan section cited.
- `test-sentinel` — reviewMode: agent-end, syncBacklog: 3. After each settled run: every
  `(must)` criterion of the open plan has a passing `Verify:` command, and new tests
  landed next to the file under test.
- `kb-sentry` — reviewMode: turn, maxNotesPerUpdate: 1. Nudge when `.kbindex/` drifts
  from the docs corpus (the kb-gate blocks at settle; this advisor nudges earlier).

Config: model `@advisor` for all three, `enabled: true`, small `maxNotesPerUpdate` — an
advisor that nags gets muted, an advisor that stays quiet is useless. Keep each
`instructions` block under ten lines and concrete to this project's real paths.
