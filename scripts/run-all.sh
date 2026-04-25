#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
exec_script="$repo_root/scripts/codex/noninteractive-exec.sh"

bash "$exec_script" bun run typecheck
bash "$exec_script" bunx biome lint . --max-diagnostics=1000
bash "$exec_script" bun test

(
  cd packages/vscode-extension
  bash "$exec_script" bun run test:all
)
