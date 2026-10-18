#!/bin/bash
# Publish npm packages in dependency order.
# Usage: ./scripts/publish.sh

set -e

published=0
skipped=0
failed=0

publish_one() {
  local dir="$1"
  local name version
  name=$(cd "$dir" && node -p "require('./package.json').name")
  version=$(cd "$dir" && node -p "require('./package.json').version")

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "⏭️  $name@$version already published, skipping"
    skipped=$((skipped + 1))
    return
  fi

  echo "📦 Building $name@$version"
  (cd "$dir" && npm run build)

  echo "📦 Publishing $name@$version"
  if (cd "$dir" && npm publish --access public); then
    published=$((published + 1))
  else
    echo "❌ Failed to publish $name@$version"
    failed=$((failed + 1))
  fi
}

# Order matters: spacefn first, then create-spacefn.
publish_one "packages/spacefn"
publish_one "packages/create-spacefn"

# vscode-spacefn is a VS Code extension (publish via `vsce publish`), not npm.
echo ""
echo "vscode-spacefn: publish with 'cd packages/vscode-spacefn && vsce publish'"

echo ""
echo "Done: $published published, $skipped skipped, $failed failed"
