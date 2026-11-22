#!/bin/bash
# Lint, test and publish spacefn, spacefn-docs and create-spacefn to npm.
# vscode-spacefn is published by .github/workflows/publish.yml.
# Usage: pnpm run publish

set -euo pipefail
cd "$(dirname "$0")/.."

# create-spacefn goes last: the apps it creates install the other two.
packages=(packages/spacefn packages/docs packages/create-spacefn)

pnpm lint "${packages[@]}"
# examples.test.ts builds the examples, so it's left to pnpm test.
pnpm -r --filter './packages/*' --filter '!vscode-spacefn' test --no-fsModuleCache --exclude '**/infra/examples.test.ts'

npm whoami >/dev/null 2>&1 || npm login

tarballs=$(mktemp -d)
trap 'rm -rf "$tarballs"' EXIT

for dir in "${packages[@]}"; do
  release=$(node -p "const p = require('./$dir/package.json'); p.name + '@' + p.version")
  if npm view "$release" version >/dev/null 2>&1; then
    echo "$release is already published"
    continue
  fi
  # pnpm packs, as npm can't resolve catalog: and workspace: versions or publishConfig's exports.
  tarball="$tarballs/${dir##*/}.tgz"
  (cd "$dir" && pnpm build && pnpm pack --out "$tarball")
  npm publish "$tarball" --access public
done
