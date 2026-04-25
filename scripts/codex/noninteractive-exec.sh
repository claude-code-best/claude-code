#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/codex/noninteractive-exec.sh <command> [args...]" >&2
  exit 2
fi

export CI="${CI:-1}"
export NO_COLOR="${NO_COLOR:-1}"

if ! command -v "$1" >/dev/null 2>&1; then
  candidates=()
  if [[ -n "${USERPROFILE:-}" ]]; then
    candidates+=("$USERPROFILE/.bun/bin/$1.exe")
  fi
  if [[ -n "${HOME:-}" ]]; then
    candidates+=("$HOME/.bun/bin/$1" "$HOME/.bun/bin/$1.exe")
  fi

  for raw_candidate in "${candidates[@]}"; do
    candidate="$raw_candidate"
    if command -v cygpath >/dev/null 2>&1; then
      candidate="$(cygpath -u "$raw_candidate" 2>/dev/null || printf '%s' "$raw_candidate")"
    fi
    if [[ -x "$candidate" ]]; then
      set -- "$candidate" "${@:2}"
      break
    fi
  done
fi

"$@"
