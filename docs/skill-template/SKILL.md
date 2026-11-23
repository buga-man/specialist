---
name: template-skill
description: "One or two sentences: what the skill does and when to apply it. This field is the main autoload trigger: the model in the host program decides from it whether to read the skill. The limit is 1024 characters."
---

# Skill title

Instructions for the agent. Write imperatively and concretely: steps, commands, verification criteria.
The agent knows the basics — do not explain the obvious. A good size is 1–2 screens.

## Steps (an example section)

1. A concrete step.
2. Another step, with a command:

   ```bash
   command --example
   ```

## Nuances and pitfalls

- What is easy to break and how to avoid it.

## Boundaries (optional — when the skill's scope is easy to overstep)

Two short lists, only when the skill needs them:

- **Can do autonomously** — actions needing no one's confirmation.
- **Requires confirmation / will not do** — neighbor skills' territory, outward
  operations, anything to hand off instead of doing.

## Troubleshooting (optional — when the skill has known failure shapes)

A table of the skill's own known ways to go wrong:

| Symptom | Likely cause | What to do |
|---|---|---|
| The output looks right but nobody can act on it | A step skipped its verification | Re-run from the last verified point |

## It's working if (optional — when success is observable)

Two or three observable outcomes with their failure tells — behavior, not vibes:

- The red command is shown with its output before any theory is offered; a theory first
  means the skill is not running.
- <observable outcome>; <what it looks like when the skill is skipped>.

<!--
Checklist for adding a new skill:
1. Copy this directory to skills/<skill-name>/ — the folder name == the name field
   (kebab-case, lowercase letters/digits/hyphens, up to 64 characters).
2. Delete this HTML comment and replace the content with the real one.
3. The skill must be portable: no machine-specific paths or settings.
   Host-specifics go to hooks/ (Claude Code: hooks.json; Codex: hooks-codex.json),
   extensions/ (pi agent), plugins/opencode/ (OpenCode).
   Skill scripts live in the skill's directory (skills/<name>/scripts/), and paths to them
   in SKILL.md are relative to the skill directory (<skill-dir>); host variables
   (${CLAUDE_PLUGIN_ROOT} and the like) are forbidden in SKILL.md.
4. Test in the hosts you target, bump the versions in .claude-plugin/plugin.json,
   plugin.json, package.json, and .claude-plugin/marketplace.json in sync.
-->
