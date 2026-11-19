# specialist-qa

The QA/reviewer role of the specialist framework — acceptance against the specs, live-stand acceptance, quality review, adversarial bug and security hunting. Skills-only plugin; the guards ship with the full specialist bundle.

Generated from the repository's roles map (`scripts/roles.mjs`) — do not edit by
hand; rebuild with `node scripts/compliance.mjs --fix`.

## Skills

- `spec-review`
- `stand-acceptance`
- `code-review`
- `bug-hunt`
- `role-qa`
- `dispatch`
- `bootstrap`

## Install

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install specialist-qa@specialist
```

Codex CLI — `codex plugin add specialist-qa@specialist`; OpenCode — point
`skills` array of `opencode.json` at this directory's `skills/`; skills only,
without the plugin — `bash scripts/copy-skills.sh <target> --role qa`.

A skills-only plugin: the guards (spec-gate, secrets-guard, vuln-guard, suite-gate,
edit-guard) ship with the full `specialist` bundle. Do not install it together with
the bundle — the skill names collide. Role switching mid-session is governed by the
`dispatch` skill.
