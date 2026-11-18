# specialist-dev

The developer role of the specialist framework — a repo spec to spec-driven code: implementation plans, tests-first minimal implementation, conventions, bug root-causing. Skills-only plugin; the guards ship with the full specialist bundle.

Generated from the repository's roles map (`scripts/roles.mjs`) — do not edit by
hand; rebuild with `node scripts/compliance.mjs --fix`.

## Skills

- `implementation-plan`
- `spec-implementation`
- `codestyle`
- `lazy`
- `root-cause`
- `role-dev`
- `dispatch`

## Install

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist-dev@specialist
```

Codex CLI — `codex plugin add specialist-dev@specialist`; OpenCode — point
`skills` array of `opencode.json` at this directory's `skills/`; skills only,
without the plugin — `bash scripts/copy-skills.sh <target> --role dev`.

A skills-only plugin: the guards (spec-gate, secrets-guard, vuln-guard, suite-gate,
edit-guard) ship with the full `specialist` bundle. Do not install it together with
the bundle — the skill names collide. Role switching mid-session is governed by the
`dispatch` skill.
