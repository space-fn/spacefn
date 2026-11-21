// Checks the packages as npm users get them: packs spacefn, spacefn-docs and
// create-spacefn, scaffolds an app per target outside the workspace with the packed
// scaffolder, installs the packed spacefn and docs with npm, then generates,
// typechecks and tests the app, serves its docs, and on Bun builds it and serves a request.
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

/** Packs `packages/<dir>`; `file` is the start of the tarball's name, when it isn't the folder's. */
const pack = (dir: string, file = dir) => {
	const cwd = join(repo, "packages", dir);
	sh("pnpm", ["build"], { cwd });
	sh("pnpm", ["pack", "--pack-destination", work], { cwd });
	return join(
		work,
		readdirSync(work).find((f) => new RegExp(`^${file}-\\d`).test(f) && f.endsWith(".tgz"))!,
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

/** Waits for `url` to answer 200, within 20 seconds. */
const answers = async (url: string, what: string) => {
	for (const end = Date.now() + 20_000; Date.now() < end;) {
		const response = await fetch(url).catch(() => undefined);
		if (response?.ok) return console.log(`GET ${url}: ${response.status}`);
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`${what} didn't answer ${url}`);
};

const serveDocs = async (app: string) => {
	const port = String(4800 + Math.floor(Math.random() * 100));
	// The bin itself: npx wouldn't pass the SIGTERM on.
	const space = join(app, "node_modules", ".bin", "space");
	const docs = spawn(space, ["docs", "--port", port], { cwd: app, stdio: "inherit" });
	try {
		await answers(`http://localhost:${port}/spacefn/writing-docs.md`, "space docs");
	} finally {
		docs.kill("SIGTERM");
	}
};

const serveOnce = async (app: string) => {
	const port = String(4700 + Math.floor(Math.random() * 100));
	const server = spawn("bun", ["dist/server/index.js"], {
		cwd: app,
		env: { ...process.env, PORT: port, SPACE_DATA_DIR: join(app, ".space", "data") },
		stdio: "inherit",
	});
	try {
		await answers(`http://localhost:${port}/health`, "the built Bun app");
	} finally {
		server.kill("SIGTERM");
	}
};

try {
	const spacefn = pack("spacefn");
	const docs = pack("docs", "spacefn-docs");
	const create = pack("create-spacefn");
	for (const tarball of [spacefn, docs, create]) checkManifest(tarball);

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
		manifest.devDependencies["spacefn-docs"] = `file:${docs}`;
		writeFileSync(join(app, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
		writeFileSync(join(app, ".env"), readFileSync(join(app, ".env.example")));
		sh("npm", ["install", "--no-audit", "--no-fund"], { cwd: app });
		sh("npm", ["run", "typecheck"], { cwd: app });
		sh("npm", ["test"], { cwd: app });
		await serveDocs(app);
		if (target === "bun") {
			sh("npm", ["run", "build"], { cwd: app });
			await serveOnce(app);
		}
		console.log(
			`✓ ${target}: installs from the tarballs, typechecks, passes its tests, serves its docs`,
		);
	}
} finally {
	if (process.env.KEEP !== "1") rmSync(work, { recursive: true, force: true });
	else console.log(`kept ${work}`);
}
