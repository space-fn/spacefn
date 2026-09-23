#!/bin/bash
# Publish all packages that have a new version
# Usage: ./scripts/publish.sh

set -e

for dir in packages/*/; do
  if [ -f "$dir/package.json" ]; then
    name=$(cd "$dir" && node -p "require('./package.json').name")
    version=$(cd "$dir" && node -p "require('./package.json').version")

    # Check if this version already exists on npm
    if npm view "$name@$version" version 2>/dev/null; then
      echo "⏭️  $name@$version already published, skipping"
    else
      echo "📦 Publishing $name@$version"
      (cd "$dir" && npm publish --access public)
    fi
  fi
done
