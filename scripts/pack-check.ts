// Checks the packages as npm users get them: packs spacefn and create-spacefn,
// scaffolds an app per target outside the workspace with the packed scaffolder,
// installs the packed spacefn with npm, then generates, typechecks and tests the
// app, and on Bun builds it and serves a request.
// Usage: node scripts/pack-check.ts [cloudflare|bun ...]
import { spawn, spawnSync, type SpawnSyncOptions } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "spacefn-pack-"));
const targets = process.argv.length > 2 ? process.argv.slice(2) : ["cloudflare", "bun"];

const sh = (command: string, args: readonly string[], options: SpawnSyncOptions = {}) => {
	console.log(`$ ${[command, ...args].join(" ")}`);
	const result = spawnSync(command, args, { stdio: "inherit", ...options });
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
};

const pack = (dir: string) => {
	const cwd = join(repo, "packages", dir);
	sh("pnpm", ["build"], { cwd });
	sh("pnpm", ["pack", "--pack-destination", work], { cwd });
	return join(
		work,
		readdirSync(work).find((f) => f.startsWith(`${dir}-`) && f.endsWith(".tgz"))!,
	);
};

/** What a published manifest must never contain: npm can't install either protocol. */
const checkManifest = (tarball: string) => {
	const dir = mkdtempSync(join(work, "manifest-"));
	sh("tar", ["-xzf", tarball, "-C", dir]);
	const text = readFileSync(join(dir, "package", "package.json"), "utf8");
	if (/"(catalog|workspace):/.test(text))
		throw new Error(`${tarball}: catalog: or workspace: left in`);
	if (text.includes("./src/")) throw new Error(`${tarball}: points at ./src/ instead of dist/`);
};

const serveOnce = async (app: string) => {
	const port = String(4700 + Math.floor(Math.random() * 100));
	const server = spawn("bun", [".space/dist/server/index.js"], {
		cwd: app,
		env: { ...process.env, PORT: port, SPACE_DATA_DIR: join(app, ".space", "data") },
		stdio: "inherit",
	});
	try {
		for (const end = Date.now() + 20_000; Date.now() < end;) {
			const response = await fetch(`http://localhost:${port}/health`).catch(() => undefined);
			if (response?.ok) return console.log(`GET /health: ${response.status}`);
			await new Promise((r) => setTimeout(r, 250));
		}
		throw new Error("the built Bun app didn't answer /health");
	} finally {
		server.kill("SIGTERM");
	}
};

try {
	const spacefn = pack("spacefn");
	const create = pack("create-spacefn");
	for (const tarball of [spacefn, create]) checkManifest(tarball);

	const scaffolder = mkdtempSync(join(work, "create-"));
	sh("tar", ["-xzf", create, "-C", scaffolder]);
	// It has no dependencies, so it runs as unpacked.

	for (const target of targets) {
		const name = `pack-${target}`;
		sh("node", [join(scaffolder, "package", "dist", "index.js"), name, "--target", target], {
			cwd: work,
		});
		const app = join(work, name);
		// The scaffold asks for the release on npm; use the one just packed.
		const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
		manifest.dependencies.spacefn = `file:${spacefn}`;
		writeFileSync(join(app, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
		writeFileSync(join(app, ".env"), readFileSync(join(app, ".env.example")));
		sh("npm", ["install", "--no-audit", "--no-fund"], { cwd: app });
		sh("npm", ["run", "typecheck"], { cwd: app });
		sh("npm", ["test"], { cwd: app });
		if (target === "bun") {
			sh("npm", ["run", "build"], { cwd: app });
			await serveOnce(app);
		}
		console.log(`✓ ${target}: installs from the tarball, typechecks, passes its tests`);
	}
} finally {
	if (process.env.KEEP !== "1") rmSync(work, { recursive: true, force: true });
	else console.log(`kept ${work}`);
}
