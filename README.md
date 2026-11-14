# Specialist skills

The repository is a plugin marketplace for **Claude Code** and a bundle package for the
**pi agent**. Each plugin lives in its own folder and installs independently; skills are
written once and work in both programs (the shared Agent Skills format).

## Plugins

| Plugin | Purpose |
|---|---|
| [feature-mastering](feature-mastering/) | skills for the full feature development cycle: from a raw task to code backed by a spec and up-to-date documentation |

## Documentation

- [Installation and dependencies](docs/installation.md) — Claude Code / pi / skills only;
  what is needed for full operation, project configuration files, verification after installation.
- [Skills](docs/skills.md) — a human-readable description of all twelve skills: why they exist,
  input → output, when they trigger, key rules.
- [Hooks](docs/hooks.md) — all ten hooks and extensions: events, what they block,
  configuration, boundaries, and fail-safe behavior.

## Installation

### Claude Code (per plugin, via the marketplace)

```
/plugin marketplace add https://github.com/buga-man/specialist.git
/plugin install feature-mastering@specialist-skills
```

Cloning goes through git. To try it out without pushing the marketplace,
you can add it by a local path to the repository.

### pi agent

A git source makes pi install the whole repository as one package (subpaths are not supported):

```bash
pi install git:github.com/buga-man/specialist.git      # bundle: all plugins of the repository
```

A single specific plugin — from a clone, by a local path:

```bash
git clone https://github.com/buga-man/specialist.git
cd specialist
pi install ./feature-mastering
```

## How to add a new plugin

1. Create a `<name>/` folder with a manifest at `<name>/.claude-plugin/plugin.json`
   (the folder name = the plugin name) and directories as needed: `skills/`, `hooks/`,
   `extensions/`, `docs/`, `scripts/`.
2. Register the plugin in the root `.claude-plugin/marketplace.json` (the `plugins` array,
   `source: "./<name>"`).
3. Create `<name>/package.json` with `pi.skills` / `pi.extensions` so that
   `pi install ./<name>` works; the root `package.json` aggregates the paths of all plugins
   for installing the repository as a whole.
4. Create the plugin's `README.md`; a new plugin's versions start at `0.1.0`
   and are independent of the others.

## Versioning

- Versions (semver) are tracked **per plugin**: in `<name>/.claude-plugin/plugin.json`
  and its entry in `marketplace.json`. The root `package.json` is the version
  of the pi bundle of the whole repository.
- Stable points are git tags `v*` (applied to the whole repository).

## Links

- The Agent Skills format (shared by both programs): https://agentskills.io
- pi documentation (skills / packages / extensions):
  https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs
- Claude Code documentation (plugins): https://code.claude.com/docs/en/plugins
