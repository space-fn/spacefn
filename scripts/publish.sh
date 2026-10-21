#!/bin/bash
# Publish npm packages in dependency order.
# Usage: ./scripts/publish.sh

set -e

published=0
skipped=0
failed=0

echo "🔎 Checks"
vp check

# The template pins the spacefn version being released.
spacefn_version=$(node -p "require('./packages/spacefn/package.json').version")
node -e '
const fs = require("node:fs");
const path = "packages/create-spacefn/template/package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.dependencies.spacefn = "^" + process.argv[1];
fs.writeFileSync(path, JSON.stringify(pkg, null, "\t") + "\n");
' "$spacefn_version"
echo "📌 template pins spacefn ^$spacefn_version"

publish_one() {
  local dir="$1"
  local test_cmd="$2"
  local name version
  name=$(cd "$dir" && node -p "require('./package.json').name")
  version=$(cd "$dir" && node -p "require('./package.json').version")

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "⏭️  $name@$version already published, skipping"
    skipped=$((skipped + 1))
    return
  fi

  echo "🔎 Testing $name@$version"
  (cd "$dir" && eval "$test_cmd")

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
publish_one "packages/spacefn" "pnpm test -- --coverage"
publish_one "packages/create-spacefn" "pnpm test"

# vscode-spacefn is a VS Code extension (publish via `vsce publish`), not npm.
# echo ""
# echo "vscode-spacefn: publish with 'cd packages/vscode-spacefn && vsce publish'"

echo ""
echo "Done: $published published, $skipped skipped, $failed failed"
[ "$failed" -eq 0 ] || exit 1
