---
name: dispatch
description: The specialist framework's entry point — classify the task by role (analyst / developer / QA) before any work starts, route to the role's entry skill, and switch roles only with the user's explicit consent. Use when a task starts and the role is unclear, when the task seems to belong to another role, or when the user asks to switch roles.
---

# Dispatch — which role takes this task

One decision comes before any work in this framework: which role owns the task. Work done
inside the wrong role produces the wrong artifacts — specs where code was expected,
verdicts without evidence, plans nobody asked for. Classify first, then load the role.

## 1. Classify

Read the task and name the role:

- **analyst** — understanding and specifying. Raw task → business spec → system spec →
  per-repository specs; documentation audits and the user manual. Signals: "what should
  we build", "write a spec", "decompose across repos", "docs are stale".
- **dev** — making it. Repo spec → plan → code, fixes, refactors, conventions. Signals:
  "implement", "fix", "refactor", "add a dependency", "make it work".
- **qa** — proving it. Acceptance against the specs, quality review, bug and security
  hunting, live-stand acceptance. Signals: "review", "does it match the spec",
  "find bugs", "accept the feature".
- **outside the framework** — ops, git chores, questions about the repo, plain chat.
  Say so in one line and just do the work; no role skill is needed.

Announce the verdict in one line ("this is a QA task — entering the qa role") and load
the entry skill of the role: `role-analyst` / `role-dev` / `role-qa`.

- The role's entry skill is not visible → that role is not installed. Name the plugin to
  install (`specialist-analyst` / `specialist-dev` / `specialist-qa`, or the full
  `specialist` bundle) or suggest a session with that role — do not approximate the
  role's work with the skills at hand.
- Unclear between two roles → ask the user one short question; do not guess.

## 2. Switching roles — only with explicit consent

Mid-task the work may outgrow the role: analysis surfaces code that must be written, a
review finds a bug to fix, implementation reveals a spec gap. Never silently drift into
another role's work. Stop and ask the user, with these options:

1. **Switch here** — say explicitly that the agent's behavior changes with the new role,
   then load the new `role-*` skill. On Claude Code and ZCode also update `.spec-gate` to
   `role: <name>` (the skill-gate hook then blocks out-of-role skills).
2. **New session with the needed role** — cleanest for heavy stage work (specs,
   acceptance); the current session keeps its context for its own role.
3. **A subagent with the role** — where the host supports subagents, hand the task to a
   fresh agent instructed to enter the role; this session keeps its role.
4. **Stay in the current role** — record the out-of-role part as an artifact for the
   other role (an open question in the spec, a bug report, an amendment) and continue.

No answer or a "no" means option 4 — the user decides, not the agent.

## Nuances

- On Claude Code and ZCode the skill-gate hook enforces this protocol: an out-of-role
  skill call is blocked with a message pointing here. That block is the protocol working,
  not an error — follow it, don't route around it.
- On hosts without the hook (pi, Codex CLI, OpenCode) this skill is the only enforcement.
  Follow it honestly.
- The fast lane for small tasks is decided inside the dev role (`lazy`,
  spec-implementation's fast profile) — not here.
