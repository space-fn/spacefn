import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { gen } from "spacefn/codegen";

import { loadTarget } from "../../src/infra/vite-config.ts";

const spacefn = fileURLToPath(new URL("../..", import.meta.url));
const docs = join(spacefn, "..", "docs");

/** Links `path` to `target`; test files set up the same fixture in parallel, so it may exist. */
const link = async (target: string, path: string) => {
	await rm(path, { force: true });
	await symlink(target, path).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "EEXIST") throw error;
	});
};

/**
 * A fixture app under `test/infra/fixtures/`, generated, with spacefn and
 * spacefn-docs linked into its node_modules as an installed app has them.
 */
export const fixtureApp = async (name: string) => {
	const root = join(spacefn, "test", "infra", "fixtures", name);
	await rm(join(root, ".space"), { recursive: true, force: true });
	// Alchemy's state and local dev data, so each run starts empty.
	await rm(join(root, ".alchemy"), { recursive: true, force: true });
	await mkdir(join(root, "node_modules"), { recursive: true });
	await link(spacefn, join(root, "node_modules", "spacefn"));
	await link(docs, join(root, "node_modules", "spacefn-docs"));
	await Effect.runPromise(Effect.flatMap(loadTarget(root), (target) => gen(root, "dev", target)));
	const data = await mkdtemp(join(tmpdir(), `space-${name}-`));
	return {
		root,
		data,
		cleanup: () => rm(data, { recursive: true, force: true }),
	};
};

const cli = join(spacefn, "src", "infra", "cli.ts");

/** Runs the `space` CLI in `cwd`, collecting its output. */
export const space = (cwd: string, args: readonly string[], env: Record<string, string> = {}) => {
	let log = "";
	const child = spawn(process.execPath, [cli, ...args], {
		cwd,
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout!.on("data", (chunk) => (log += chunk));
	child.stderr!.on("data", (chunk) => (log += chunk));
	const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
	return { child, exited, log: () => log };
};

export const until = async (check: () => Promise<boolean> | boolean, ms = 60_000) => {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200)))
		if (await Promise.resolve(check()).catch(() => false)) return;
	throw new Error("timed out");
};

export const text = async (url: string, init?: RequestInit) =>
	(await (await fetch(url, init)).text()).replace(/\s+/g, " ");

/** Processes whose command line contains `pattern`. */
export const processes = (pattern: string) =>
	spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" })
		.stdout.trim()
		.split("\n")
		.filter(Boolean);
