#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2] ?? "spacefn-app";
const target = resolve(process.cwd(), name);

if (existsSync(target)) {
	console.error(`${target} already exists`);
	process.exit(1);
}

const here = fileURLToPath(new URL(".", import.meta.url));
const template = resolve(here, "..", "template");

mkdirSync(target, { recursive: true });
cpSync(template, target, { recursive: true });

console.log(`Created ${target}`);
console.log("Run: cd " + name + " && pnpm install");
