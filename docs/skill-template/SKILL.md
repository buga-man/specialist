---
name: template-skill
description: "One or two sentences: what the skill does and when to apply it. This field is the main autoload trigger: the model in both programs decides from it whether to read the skill. The limit is 1024 characters."
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

<!--
Checklist for adding a new skill:
1. Copy this directory to skills/<skill-name>/ — the folder name == the name field
   (kebab-case, lowercase letters/digits/hyphens, up to 64 characters).
2. Delete this HTML comment and replace the content with the real one.
3. The skill must be portable: no machine-specific paths or settings.
   Host-specifics go to hooks/ (Claude Code) or extensions/ (pi agent).
   Skill scripts live in the skill's directory (skills/<name>/scripts/), and paths to them
   in SKILL.md are relative to the skill directory (<skill-dir>); host variables
   (${CLAUDE_PLUGIN_ROOT} and the like) are forbidden in SKILL.md.
4. Test in both programs (Claude Code and pi), bump the versions
   in .claude-plugin/plugin.json, .claude-plugin/marketplace.json, and package.json in sync.
-->
