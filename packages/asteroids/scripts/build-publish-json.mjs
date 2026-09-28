// Generate dist/package.json for npm publish (zero dependencies)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distPkg = resolve(root, "dist", "package.json");
const srcPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));

// Strip workspace deps — they're bundled into dist
const publish = {
	name: srcPkg.name,
	version: srcPkg.version,
	description: srcPkg.description,
	type: "module",
	main: "./index.js",
	types: "./index.d.ts",
	exports: {
		".": {
			import: "./index.js",
			types: "./index.d.ts",
		},
		"./hono": {
			import: "./hono.js",
			types: "./hono.d.ts",
		},
		"./vite": {
			import: "./vite.js",
			types: "./vite.d.ts",
		},
	},
	// Only hono peer dep remains — everything else is bundled
	peerDependencies: srcPkg.peerDependencies,
	peerDependenciesMeta: srcPkg.peerDependenciesMeta,
	files: ["*.js", "*.d.ts", "!*.test.*"],
};

writeFileSync(distPkg, JSON.stringify(publish, null, "\t") + "\n");
console.log(`✅ Generated ${distPkg}`);
