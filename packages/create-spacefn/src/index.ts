#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const name = process.argv[2] ?? "spacefn-app";
const target = resolve(process.cwd(), name);

if (existsSync(target)) {
	console.error(`${target} already exists`);
	process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(resolve(process.cwd(), "..", "playground"), target, {
	recursive: true,
	filter: (source) =>
		!source.includes("node_modules") && !source.includes(".cloudflare") && !source.includes("dist"),
});

console.log(`Created ${target}`);
console.log("Run: cd " + name + " && pnpm install");
