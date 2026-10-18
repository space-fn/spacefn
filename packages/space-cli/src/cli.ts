#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { Command } from "commander";

const program = new Command();

program.name("space").description("CLI for spacefn projects").version("0.0.0");

function run(command: string, args: string[]): Promise<number> {
	return new Promise((resolveExit) => {
		const child = spawn("pnpm", ["exec", command, ...args], { stdio: "inherit", shell: true });
		child.on("exit", (code) => resolveExit(code ?? 0));
	});
}

program
	.command("dev")
	.description("Start the Vite dev server")
	.action(async () => process.exit(await run("vite", ["dev"])));

program
	.command("build")
	.description("Build the app")
	.action(async () => process.exit(await run("vite", ["build"])));

program
	.command("gen")
	.description("Regenerate .space/ without starting Vite")
	.action(async () => {
		const { sync } = await import("spacefn/sync");
		await sync(resolve(process.cwd()), "dev");
		console.log("Regenerated .space/");
	});

program
	.command("deploy")
	.description("Build and deploy to Cloudflare")
	.action(async () => {
		const buildCode = await run("vite", ["build"]);
		if (buildCode !== 0) process.exit(buildCode);
		const { existsSync } = await import("node:fs");
		const cfCandidates = [
			resolve(process.cwd(), "node_modules", ".pnpm", "node_modules", ".bin", "cf"),
			resolve(process.cwd(), "..", "node_modules", ".pnpm", "node_modules", ".bin", "cf"),
			resolve(process.cwd(), "..", "packages", "spacefn", "node_modules", "cf", "bin", "cf"),
		];
		const cfBin = cfCandidates.find((p) => existsSync(p)) ?? "cf";
		if (existsSync(cfBin)) {
			const code = await new Promise<number>((done) => {
				const child = spawn(cfBin, ["deploy"], { stdio: "inherit" });
				child.on("exit", (c) => done(c ?? 0));
			});
			process.exit(code);
		}
		process.exit(await run("cf", ["deploy"]));
	});

program
	.command("migrate")
	.description("Apply pending migrations to the shared database")
	.option("--binding <name>", "The D1 binding name", "DB")
	.option("--dry-run", "List pending migrations without applying them")
	.action(async (options: { binding: string; dryRun?: boolean }) => {
		const migrations = await import(`${resolve(process.cwd(), ".space/migrations.js")}`).catch(
			() => undefined,
		);
		if (!migrations) {
			console.error("Run `space gen` first: .space/migrations.js is missing.");
			process.exit(1);
		}
		const binding = process.env[options.binding];
		if (!binding) {
			console.error(
				`The ${options.binding} binding is not available. Run this through cf or wrangler with the right env.`,
			);
			process.exit(1);
		}
		const { d1Executor, runMigrations } = await import("spacefn/db");
		if (options.dryRun) {
			console.log(
				`Pending migrations: ${migrations.migrations.map((m: { name: string }) => m.name).join(", ") || "(none)"}`,
			);
			return;
		}
		const applied = await runMigrations(d1Executor(binding), migrations.migrations);
		console.log(applied.length === 0 ? "No pending migrations" : `Applied: ${applied.join(", ")}`);
	});

program
	.command("doctor")
	.description("Validate the app/ layout and generated .space/ files")
	.action(async () => {
		const { existsSync } = await import("node:fs");
		const root = process.cwd();
		const checks: string[] = [];
		if (!existsSync(resolve(root, "app"))) checks.push("missing app/ folder");
		if (!existsSync(resolve(root, ".space"))) checks.push("missing .space/ (run `space gen`)");
		if (!existsSync(resolve(root, "env.ts")))
			checks.push("missing env.ts (optional but recommended)");
		if (checks.length === 0) {
			console.log("OK: app layout looks valid.");
		} else {
			for (const c of checks) console.error(`- ${c}`);
			process.exit(1);
		}
	});

program.parseAsync(process.argv).catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
