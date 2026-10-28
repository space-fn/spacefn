#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cd playground
vp build >/dev/null 2>&1
node -e '
const fs = require("fs");
const p = ".cloudflare/output/v0/workers/default/bundle/index.js";
const b = fs.statSync(p).size;
console.log("worker bundle bytes:", b);
'
