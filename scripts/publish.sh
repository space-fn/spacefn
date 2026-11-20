#!/bin/bash
# Publish spacefn, spacefn-docs and create-spacefn, released together at one version.
# pnpm publish turns catalog: and workspace: into real versions and applies
# publishConfig (dist/ exports and bin); npm publish would do neither.
# Usage: pnpm run publish

set -euo pipefail

packages=(packages/spacefn packages/docs packages/create-spacefn)
version=$(node -p "require('./packages/spacefn/package.json').version")
for dir in "${packages[@]}"; do
  other=$(node -p "require('./$dir/package.json').version")
  if [ "$other" != "$version" ]; then
    echo "❌ spacefn is $version but $dir is $other; release them at one version" >&2
    exit 1
  fi
done

# A prerelease goes to the next tag, so `npm create spacefn` keeps giving the last release.
tag=latest
[[ "$version" == *-* ]] && tag=next

echo "🔎 Checks and tests"
pnpm check
pnpm test

echo "📦 Installing the packed packages into fresh apps"
node scripts/pack-check.ts

if ! npm whoami >/dev/null 2>&1; then
  echo "🔐 npm is not logged in; starting npm login"
  npm login
fi

# create-spacefn last: the apps it scaffolds depend on the other two.
for dir in "${packages[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "⏭️  $name@$version is already published"
    continue
  fi
  echo "🚀 Publishing $name@$version ($tag)"
  (cd "$dir" && pnpm build && pnpm publish --access public --tag "$tag")
done

echo "Done. To publish vscode-spacefn, run: pnpm publish:vscode"
