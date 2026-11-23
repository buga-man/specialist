#!/usr/bin/env bash
# Copies skills from skills/ into the skills directory of one of the programs — without installing the plugin.
#
# Usage:
#   ./scripts/copy-skills.sh <target> [--role analyst|dev|qa]
#
# Targets:
#   claude   ~/.claude/skills     — personal Claude Code skills (also read by OpenCode)
#   pi       ~/.pi/agent/skills   — global pi agent skills
#   omp      ~/.omp/agent/skills  — global oh-my-pi skills (omp does not read ~/.pi/agent/skills)
#   agents   ~/.agents/skills     — cross-harness directory (read by pi, oh-my-pi, and OpenCode)
#   codex    ~/.codex/skills      — personal Codex CLI skills
#   opencode ~/.config/opencode/skills — global OpenCode skills
#   <path>   an arbitrary directory (e.g. .claude/skills or .codex/skills inside a project)
#
# --role copies only the skills of that role plugin (analyst / dev / qa): the list
# comes from scripts/roles.mjs — the same map the role plugins are generated from.
# Without --role every skills/*/ directory that contains a SKILL.md is copied.
# Skills that already exist are not overwritten without confirmation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/../skills"

usage() {
  # Prints the header comment (lines 2..the first non-comment line) — does not break when the header is edited.
  awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
}

TARGET_ARG=""
ROLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --role)
      if [ $# -lt 2 ]; then echo "Error: --role needs a value (analyst|dev|qa)" >&2; exit 2; fi
      ROLE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [ -n "$TARGET_ARG" ]; then echo "Error: unexpected argument: $1" >&2; usage; exit 2; fi
      TARGET_ARG="$1"; shift ;;
  esac
done
[ -n "$TARGET_ARG" ] || { usage; exit 0; }

case "$TARGET_ARG" in
  claude)   DEST="$HOME/.claude/skills" ;;
  pi)       DEST="$HOME/.pi/agent/skills" ;;
  omp)      DEST="$HOME/.omp/agent/skills" ;;
  agents)   DEST="$HOME/.agents/skills" ;;
  codex)    DEST="$HOME/.codex/skills" ;;
  opencode) DEST="$HOME/.config/opencode/skills" ;;
  *)        DEST="$TARGET_ARG" ;;
esac

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: directory not found: $SRC_DIR" >&2
  exit 1
fi

ROLE_SKILLS=""
if [ -n "$ROLE" ]; then
  # roles.mjs prints one skill name per line; exit 2 + usage on an unknown role.
  if ! ROLE_SKILLS="$(node "$SCRIPT_DIR/roles.mjs" "$ROLE" 2>&1)"; then
    echo "Error: unknown role \"$ROLE\"" >&2
    echo "$ROLE_SKILLS" >&2
    exit 1
  fi
fi

mkdir -p "$DEST"
echo "Source: $SRC_DIR"
echo "Target: $DEST"
[ -n "$ROLE" ] && echo "Role: $ROLE"

# Copies one skill directory by name (no-op without a SKILL.md).
copy_skill() {
  local name="$1"
  local src="$SRC_DIR/$name"
  [ -f "$src/SKILL.md" ] || return 0
  local target="$DEST/$name"
  if [ -e "$target" ]; then
    read -r -p "  \"$name\" already exists in the target. Overwrite? [y/N] " answer || answer=""
    case "$answer" in
      [yY]*) rm -rf "$target" ;;
      *)     echo "  skipped: $name"; return 0 ;;
    esac
  fi
  cp -R "$src" "$target"
  echo "  installed: $name"
  COUNT=$((COUNT + 1))
}

COUNT=0
shopt -s nullglob
if [ -n "$ROLE" ]; then
  # Skill names are kebab-case (compliance-enforced) — word splitting is safe.
  for name in $ROLE_SKILLS; do
    copy_skill "$name"
  done
else
  for skill_dir in "$SRC_DIR"/*/; do
    copy_skill "$(basename "$skill_dir")"
  done
fi

if [ "$COUNT" -eq 0 ]; then
  echo "Done: nothing to copy (no matching skills in skills/, or all are already installed and were skipped)."
else
  echo "Done: skills copied: $COUNT"
fi
