# specialist-analyst

The analyst role of the specialist framework — a raw task to business, system, and per-repository specs, and documentation that stays true to the code. Skills-only plugin; the guards ship with the full specialist bundle.

Generated from the repository's roles map (`scripts/roles.mjs`) — do not edit by
hand; rebuild with `node scripts/compliance.mjs --fix`.

## Skills

- `brainstorm`
- `system-thinking`
- `decompositor`
- `kb-index`
- `tech-writer`
- `trace-audit`
- `role-analyst`
- `dispatch`

## Install

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist-analyst@specialist
```

Codex CLI — `codex plugin add specialist-analyst@specialist`; OpenCode — point
`skills` array of `opencode.json` at this directory's `skills/`; skills only,
without the plugin — `bash scripts/copy-skills.sh <target> --role analyst`.

A skills-only plugin: the guards (spec-gate, secrets-guard, vuln-guard, suite-gate,
edit-guard) ship with the full `specialist` bundle. Do not install it together with
the bundle — the skill names collide. Role switching mid-session is governed by the
`dispatch` skill.
