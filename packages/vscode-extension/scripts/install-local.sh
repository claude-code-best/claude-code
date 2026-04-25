#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building extension..."
bun run build

SOURCE_DIR="$(pwd)"
if [[ ! -f "${SOURCE_DIR}/package.json" ]]; then
  echo "Extension manifest not found at ${SOURCE_DIR}/package.json" >&2
  exit 1
fi

PKG_PUBLISHER=$(node -p "require('./package.json').publisher")
PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")
EXT_ROOT="$HOME/.vscode/extensions"
VSIX_ID="${PKG_PUBLISHER}.${PKG_NAME}"
EXT_DIR="${EXT_ROOT}/${VSIX_ID}-${PKG_VERSION}"

mkdir -p "$EXT_ROOT"

# Remove every prior version of this extension. Leaving older copies behind
# causes VS Code to load stale webview bundles and masks new fixes — every
# install-local must start from a clean slate.
shopt -s nullglob
for entry in "${EXT_ROOT}/${VSIX_ID}-"*; do
  if [[ "$entry" != "$EXT_DIR" ]]; then
    echo "Removing stale version: $(basename "$entry")"
    rm -rf "$entry"
  fi
done

rm -rf "$EXT_DIR"
ln -sf "$SOURCE_DIR" "$EXT_DIR"

if [[ ! -f "${EXT_DIR}/package.json" ]]; then
  echo "Install verification failed: missing ${EXT_DIR}/package.json" >&2
  exit 1
fi
if [[ ! -f "${EXT_DIR}/dist/extension.js" ]]; then
  echo "Install verification failed: missing ${EXT_DIR}/dist/extension.js" >&2
  exit 1
fi

echo "Installed: $EXT_DIR -> $SOURCE_DIR"
echo "Active extension dirs:"
for entry in "${EXT_ROOT}/${VSIX_ID}-"*; do
  echo "  $(basename "$entry")"
done
echo ""
echo "Fully QUIT VS Code (not just reload window) and reopen to pick up the fresh build."
