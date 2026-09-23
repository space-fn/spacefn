#!/bin/bash
# Publish all packages that have a new version
# Usage: ./scripts/publish.sh

set -e

published=0
skipped=0
failed=0

for dir in packages/*/; do
  if [ -f "$dir/package.json" ]; then
    name=$(cd "$dir" && node -p "require('./package.json').name")
    version=$(cd "$dir" && node -p "require('./package.json').version")

    # Check if this version already exists on npm
    if npm view "$name@$version" version 2>/dev/null; then
      echo "⏭️  $name@$version already published, skipping"
      skipped=$((skipped + 1))
    else
      echo "📦 Publishing $name@$version"
      if (cd "$dir" && npm publish --access public); then
        published=$((published + 1))
      else
        echo "❌ Failed to publish $name@$version"
        failed=$((failed + 1))
      fi
    fi
  fi
done

echo ""
echo "Done: $published published, $skipped skipped, $failed failed"
