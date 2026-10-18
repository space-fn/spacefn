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
		const { sync } = await import("./sync");
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
	.description("Apply pending migrations to a database")
	.option("--db <name>", "Database name under app/db/", "main")
	.option("--binding <name>", "The D1 binding name", "DB")
	.option("--down", "Roll back instead of applying")
	.option("--dry-run", "List pending migrations without applying them")
	.action(async (options: { db: string; binding: string; down?: boolean; dryRun?: boolean }) => {
		const mod = await import(`${resolve(process.cwd(), ".space", "db", `${options.db}.js`)}`).catch(
			() => undefined,
		);
		if (!mod) {
			console.error("Run `space gen` first: .space/db is missing.");
			process.exit(1);
		}
		const binding = process.env[options.binding];
		if (!binding) {
			console.error(
				`The ${options.binding} binding is not available. Run this through cf or wrangler with the right env.`,
			);
			process.exit(1);
		}
		const { d1Executor } = await import("./db");
		const db = d1Executor(binding);
		if (options.dryRun) {
			console.log(
				`Migrations: ${mod.migrations.map((m: { id: string }) => m.id).join(", ") || "(none)"}`,
			);
			return;
		}
		const applied = await mod.migrate(db, options.down ? "down" : "up");
		console.log(applied.length === 0 ? "No pending migrations" : `Applied: ${applied.join(", ")}`);
	});

program
	.command("clean")
	.description("Remove generated .space/ and .cloudflare/ directories")
	.action(async () => {
		const { rmSync, existsSync } = await import("node:fs");
		const root = process.cwd();
		for (const dir of [".space", ".cloudflare"]) {
			const p = resolve(root, dir);
			if (existsSync(p)) {
				rmSync(p, { recursive: true, force: true });
				console.log(`Removed ${dir}/`);
			}
		}
	});

program
	.command("doctor")
	.description("Validate the app/ layout and generated files")
	.action(async () => {
		const { existsSync } = await import("node:fs");
		const root = process.cwd();
		const checks: string[] = [];
		if (!existsSync(resolve(root, "app"))) checks.push("missing app/ folder");
		if (!existsSync(resolve(root, ".space"))) checks.push("missing .space/ (run `space gen`)");
		if (!existsSync(resolve(root, "tsconfig.json"))) checks.push("missing tsconfig.json");
		const tsconfig = existsSync(resolve(root, "tsconfig.json"))
			? JSON.parse((await import("node:fs")).readFileSync(resolve(root, "tsconfig.json"), "utf8"))
			: null;
		if (tsconfig && !tsconfig.compilerOptions?.paths?.["@space/*"]) {
			checks.push("tsconfig missing @space/* path alias");
		}
		const envFile = resolve(root, "app", "env.ts");
		if (existsSync(envFile)) {
			const devVars = resolve(root, ".dev.vars");
			if (!existsSync(devVars)) checks.push("missing .dev.vars (needed for local secrets)");
		}
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
