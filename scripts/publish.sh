#!/bin/bash
# Publish spacefn, spacefn-docs and create-spacefn, released together at one version:
# an app scaffolded by create-spacefn@X depends on spacefn@^X and spacefn-docs@^X.
# pnpm builds and packs, npm publishes the tarball: pnpm pack turns catalog: and
# workspace: into real versions and applies publishConfig (dist/ exports and bin),
# which npm publish wouldn't do from the folder.
# vscode-spacefn has its own version and its own script: pnpm publish:vscode.
# Usage: pnpm run publish

set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

# In publish order: create-spacefn last, since the apps it scaffolds need the other two.
packages=(packages/spacefn packages/docs packages/create-spacefn)

version=$(node -p "require('./packages/spacefn/package.json').version")
for dir in "${packages[@]}"; do
  other=$(node -p "require('./$dir/package.json').version")
  if [ "$other" != "$version" ]; then
    echo "❌ spacefn is $version but $dir is $other; release them at one version" >&2
    exit 1
  fi
done

# A release is what's committed on main, so the tag below names exactly what was published.
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  echo "❌ On $branch: publish from main" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ The working tree has changes: commit or stash them first" >&2
  exit 1
fi

# A prerelease goes to the next tag, so `npm create spacefn` keeps giving the last release.
tag=latest
[[ "$version" == *-* ]] && tag=next

echo "📋 Releasing $version ($tag):"
for dir in "${packages[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  current=$(npm view "$name" dist-tags.latest 2>/dev/null || true)
  echo "   $name: ${current:-not on npm yet} → $version"
done

# The examples aren't typechecked, tested or built here: pnpm check and pnpm test do that
# in development and on pull requests, and pack-check tries the packages in fresh apps.
echo "🔎 Checks and tests of the packages"
pnpm fmt --check
pnpm lint
pnpm -r --filter './packages/*' typecheck
pnpm -r --filter './packages/*' test --no-fsModuleCache --exclude '**/infra/examples.test.ts'

echo "📦 Installing the packed packages into fresh apps"
node scripts/pack-check.ts --upgrade-if-changed

if ! npm whoami >/dev/null 2>&1; then
  echo "🔐 npm is not logged in; starting npm login"
  npm login
fi

tarballs=$(mktemp -d)
trap 'rm -rf "$tarballs"' EXIT

for dir in "${packages[@]}"; do
  name=$(node -p "require('./$dir/package.json').name")
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "⏭️  $name@$version is already published"
    continue
  fi
  echo "🚀 Publishing $name@$version ($tag)"
  tarball="$tarballs/$name-$version.tgz"
  (cd "$dir" && pnpm build && pnpm pack --out "$tarball")
  # npm's error is read from its own log, as piping its output would hide the one-time password prompt.
  logs=$(mktemp -d)
  if npm publish "$tarball" --access public --tag "$tag" --logs-dir "$logs"; then
    rm -rf "$logs"
  # npm takes minutes to show a publish to npm view, but refuses a second one at once.
  elif grep -rqsi "cannot publish over the previously published versions" "$logs"; then
    rm -rf "$logs"
    echo "⏭️  $name@$version is already published; npm may take a few minutes to show it"
  else
    echo "❌ Publishing $name@$version failed; npm's log is in $logs" >&2
    exit 1
  fi
done

if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "⏭️  Tag v$version already exists"
else
  git tag -a "v$version" -m "spacefn $version"
  echo "🏷️  Tagged v$version; push it with: git push origin v$version"
fi

vscode=$(node -p "require('./packages/vscode-spacefn/package.json').version")
echo "Done. vscode-spacefn is at $vscode; to publish it, run: pnpm publish:vscode"
