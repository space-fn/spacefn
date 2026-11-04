#!/bin/bash
# Publish vscode-spacefn after the latest spacefn npm release is available.
# Usage: pnpm publish:vscode

set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

dependency_files=(packages/vscode-spacefn/package.json pnpm-lock.yaml)
if ! git diff --quiet -- "${dependency_files[@]}" || ! git diff --cached --quiet -- "${dependency_files[@]}"; then
  echo "❌ Commit or stash existing changes to the extension manifest and lockfile before publishing" >&2
  exit 1
fi

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

echo "🔎 Looking up the latest published spacefn version"
spacefn_version="$(npm view spacefn version)"
if [ -z "$spacefn_version" ]; then
  echo "❌ Could not determine the latest published spacefn version" >&2
  exit 1
fi

echo "📌 Updating vscode-spacefn dependency to spacefn ^$spacefn_version"
pnpm --filter vscode-spacefn add --save-dev "spacefn@^$spacefn_version"

echo "🔎 Testing vscode-spacefn"
pnpm --filter vscode-spacefn test

echo "📦 Compiling vscode-spacefn"
pnpm --filter vscode-spacefn run compile

if ! git diff --quiet -- "${dependency_files[@]}"; then
  echo "📝 Committing the published spacefn dependency update"
  git add -- "${dependency_files[@]}"
  git commit -m "chore(vscode): update spacefn to $spacefn_version"
else
  echo "ℹ️  Dependency and lockfile are already up to date; no commit needed"
fi

echo "🚀 Publishing vscode-spacefn to the VS Code Marketplace"
pnpm --filter vscode-spacefn exec vsce publish
