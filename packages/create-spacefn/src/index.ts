#!/usr/bin/env node
import { resolve } from "node:path";

import { scaffold } from "./scaffold";

const name = process.argv[2] ?? "spacefn-app";
const target = resolve(process.cwd(), name);

try {
	scaffold(target, name);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

console.log(`Created ${target}`);
console.log("Run: cd " + name + " && pnpm install");
