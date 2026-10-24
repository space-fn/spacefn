#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { Command } from "commander";

const require = createRequire(import.meta.url);
let CLI_VERSION = "0.0.0";
try {
	CLI_VERSION = (require("../package.json") as { version?: string }).version ?? "0.0.0";
} catch {
	// Fall back to the hardcoded version if package.json cannot be resolved.
}

const program = new Command();

program.name("space").description("CLI for spacefn projects").version(CLI_VERSION);

function run(command: string, args: string[]): Promise<number> {
	return new Promise((resolveExit) => {
		const child = spawn("pnpm", ["exec", command, ...args], { stdio: "inherit" });
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
		// `cf`, the Cloudflare CLI, ships with spacefn as a dependency. Resolve its
		// bin from this package: a dependency's bin is not on the app's PATH.
		const { readFileSync } = await import("node:fs");
		const { createRequire } = await import("node:module");
		const { dirname, join } = await import("node:path");
		const nodeRequire = createRequire(import.meta.url);
		const cfPkgPath = nodeRequire.resolve("cf/package.json");
		const cfPkg = JSON.parse(readFileSync(cfPkgPath, "utf8")) as {
			bin?: string | Record<string, string>;
		};
		const entry = typeof cfPkg.bin === "string" ? cfPkg.bin : cfPkg.bin?.cf;
		if (!entry) {
			console.error("The cf package declares no bin. Reinstall dependencies.");
			process.exit(1);
		}
		const code = await new Promise<number>((done) => {
			const child = spawn(join(dirname(cfPkgPath), entry), ["deploy"], { stdio: "inherit" });
			child.on("exit", (c) => done(c ?? 0));
		});
		process.exit(code);
	});

program
	.command("db")
	.description("Database tools")
	.command("doctor")
	.description("Validate db migrations and queries against their schema")
	.option("--db <name>", "Database name under app/db/")
	.option("--json", "Output machine-readable JSON")
	.action(async (options: { db?: string; json?: boolean }) => {
		const { readdir } = await import("node:fs/promises");
		const { join, resolve } = await import("node:path");
		const appDb = resolve(process.cwd(), "app", "db");
		if (options.db && !/^[a-zA-Z0-9_-]+$/.test(options.db)) {
			console.error(`Invalid database name: ${options.db}`);
			process.exit(1);
		}
		let names: string[] = [];
		if (options.db) {
			names = [options.db];
		} else {
			try {
				const entries = await readdir(appDb, { withFileTypes: true });
				names = entries
					.filter((e) => e.isDirectory())
					.map((e) => e.name)
					.sort();
			} catch {
				console.error("No app/db/ folder found.");
				process.exit(1);
			}
		}
		let ok = true;
		const results: { db: string; ok: boolean; message: string }[] = [];
		for (const name of names) {
			const dir = join(appDb, name);
			try {
				let dialect: "sqlite" | "postgres" = "sqlite";
				let dialectNote = "dialect=sqlite (default: no config.ts)";
				const configPath = join(dir, "config.ts");
				try {
					const cfg = await import(configPath);
					dialect = (cfg.default ?? cfg).dialect ?? "sqlite";
					dialectNote = `dialect=${dialect}`;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					if (!/Cannot find module|ERR_MODULE_NOT_FOUND|ENOENT/.test(message)) {
						throw new Error(`config.ts failed to load: ${message}`);
					}
					// No config.ts: sqlite is the documented default, and the
					// fallback is reported in the result line.
				}
				const { scanMigrations, analyzeQueries } = await import("./db");
				const migrations = await scanMigrations(join(dir, "migrations"));
				await analyzeQueries(join(dir, "queries"), migrations, dialect);
				results.push({
					db: name,
					ok: true,
					message: `${migrations.length} migrations, ${dialectNote}`,
				});
				if (!options.json)
					console.log(`OK  ${name} (${migrations.length} migrations, ${dialectNote})`);
			} catch (error) {
				ok = false;
				const msg = error instanceof Error ? error.message : String(error);
				results.push({ db: name, ok: false, message: msg });
				if (!options.json) console.error(`FAIL ${name}: ${msg}`);
			}
		}
		if (options.json) console.log(JSON.stringify(results));
		if (!ok) process.exit(1);
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
		if (existsSync(resolve(root, "env.ts"))) {
			checks.push("env.ts at the project root is ignored; it must live at app/env.ts");
		}
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
