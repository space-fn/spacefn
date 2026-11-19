#!/bin/bash
# Publish vscode-spacefn. @spacefn/sql comes from the workspace and is bundled into the server.
# Usage: pnpm publish:vscode

set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

publisher="$(node -p "require('./packages/vscode-spacefn/package.json').publisher")"
if ! publishers="$(pnpm --filter vscode-spacefn exec vsce ls-publishers 2>/dev/null)" ||
  ! grep -Fxq "$publisher" <<<"$publishers"; then
  echo "🔐 VS Code Marketplace publisher '$publisher' is not logged in; starting vsce login"
  pnpm --filter vscode-spacefn exec vsce login "$publisher"
  publishers="$(pnpm --filter vscode-spacefn exec vsce ls-publishers)"
  if ! grep -Fxq "$publisher" <<<"$publishers"; then
    echo "❌ VS Code Marketplace login did not authenticate publisher '$publisher'" >&2
    exit 1
  fi
fi

echo "🔎 Testing vscode-spacefn"
pnpm --filter vscode-spacefn test

echo "📦 Compiling vscode-spacefn"
pnpm --filter vscode-spacefn run compile

echo "🚀 Publishing vscode-spacefn to the VS Code Marketplace"
pnpm --filter vscode-spacefn exec vsce publish
