#!/usr/bin/env node
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { scaffold, TARGETS, type Target } from "./scaffold.ts";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		target: { type: "string", short: "t" },
		// Inside the spacefn repo, for the starter examples: workspace and catalog versions.
		workspace: { type: "boolean" },
	},
});

const name = positionals[0] ?? "spacefn-app";

const askTarget = async (): Promise<Target> => {
	if (!process.stdin.isTTY) return "cloudflare";
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = (
		await rl.question("Run it on Cloudflare Workers or Bun (Docker)? [cloudflare/bun] ")
	).trim();
	rl.close();
	return answer === "bun" ? "bun" : "cloudflare";
};

const target = values.target ?? (await askTarget());
if (!TARGETS.includes(target as Target)) {
	console.error(`Unknown target "${target}". Use --target cloudflare or --target bun.`);
	process.exit(1);
}

/** The package manager that ran us, for the next steps. */
const manager = (process.env.npm_config_user_agent ?? "npm").split("/")[0]!;

try {
	scaffold(resolve(process.cwd(), name), {
		name,
		target: target as Target,
		workspace: values.workspace ?? false,
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

console.log(`Created ${name} for ${target === "cloudflare" ? "Cloudflare Workers" : "Bun"}. Next:

  cd ${name}
  cp .env.example .env
  ${manager} install
  ${manager} run dev
`);
