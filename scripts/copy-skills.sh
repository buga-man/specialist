#!/usr/bin/env bash
# Copies skills from skills/ into the skills directory of one of the programs — without installing the plugin.
#
# Usage:
#   ./scripts/copy-skills.sh <target>
#
# Targets:
#   claude   ~/.claude/skills     — personal Claude Code skills (also read by OpenCode)
#   pi       ~/.pi/agent/skills   — global pi agent skills
#   agents   ~/.agents/skills     — cross-harness directory (read by pi and OpenCode)
#   codex    ~/.codex/skills      — personal Codex CLI skills
#   opencode ~/.config/opencode/skills — global OpenCode skills
#   <path>   an arbitrary directory (e.g. .claude/skills or .codex/skills inside a project)
#
# Only skills/*/ directories that contain a SKILL.md are copied.
# Skills that already exist are not overwritten without confirmation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/../skills"

usage() {
  # Prints the header comment (lines 2..the first non-comment line) — does not break when the header is edited.
  awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
}

DEST=""
case "${1:-}" in
  claude)   DEST="$HOME/.claude/skills" ;;
  pi)       DEST="$HOME/.pi/agent/skills" ;;
  agents)   DEST="$HOME/.agents/skills" ;;
  codex)    DEST="$HOME/.codex/skills" ;;
  opencode) DEST="$HOME/.config/opencode/skills" ;;
  -h|--help|"") usage; exit 0 ;;
  *)      DEST="$1" ;;
esac

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: directory not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DEST"
echo "Source: $SRC_DIR"
echo "Target: $DEST"

shopt -s nullglob
count=0
for skill_dir in "$SRC_DIR"/*/; do
  [ -f "${skill_dir}SKILL.md" ] || continue
  name="$(basename "$skill_dir")"
  target="$DEST/$name"
  if [ -e "$target" ]; then
    read -r -p "  \"$name\" already exists in the target. Overwrite? [y/N] " answer || answer=""
    case "$answer" in
      [yY]*) rm -rf "$target" ;;
      *)     echo "  skipped: $name"; continue ;;
    esac
  fi
  cp -R "${skill_dir%/}" "$target"
  echo "  installed: $name"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "Done: nothing to copy (no skills in skills/, or all are already installed and were skipped)."
else
  echo "Done: skills copied: $count"
fi
