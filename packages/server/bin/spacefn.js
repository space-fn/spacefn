#!/usr/bin/env node

// --- Space CLI ----------------------------------------------------------------
// Usage:
//   spacefn dev    — Start development server
//   spacefn build  — Build for production

import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];

const root = process.cwd();

async function dev() {
	const { createServer } = await import("vite");
	const { space } = await import(resolve(root, "node_modules/@spacefn/server/dist/vite/index.js"));

	const server = await createServer({
		root,
		plugins: [space({ root })],
	});

	await server.listen();

	server.printUrls();
}

async function build() {
	const { build } = await import("vite");
	const { space } = await import(resolve(root, "node_modules/@spacefn/server/dist/vite/index.js"));

	await build({
		root,
		plugins: [space({ root })],
		server: {
			type: "module",
		},
	});

	console.log("[space] Build complete");
}

switch (command) {
	case "dev":
		dev().catch((err) => {
			console.error(err);
			process.exit(1);
		});
		break;
	case "build":
		build().catch((err) => {
			console.error(err);
			process.exit(1);
		});
		break;
	default:
		console.error(`[spacefn] Unknown command: ${command}`);
		console.error("Usage: spacefn <dev|build>");
		process.exit(1);
}
