import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { gen } from "spacefn/internal/codegen";

import { loadTarget } from "../../src/infra/vite-config.ts";

const spacefn = fileURLToPath(new URL("../..", import.meta.url));

/**
 * An app in the repo's `examples/`, a workspace package, freshly generated and
 * without the local data of a previous run.
 */
export const fixtureApp = async (
	name: "services-cloudflare" | "services-bun",
	/** A copy in a temporary folder, for a test that builds while others serve the app. */
	options: { readonly copy?: boolean } = {},
) => {
	const example = join(spacefn, "..", "..", "examples", name);
	const root = options.copy ? await mkdtemp(join(tmpdir(), `${name}-`)) : example;
	if (options.copy) {
		const skip = new Set(["node_modules", ".space", ".alchemy", "dist"]);
		await cp(example, root, { recursive: true, filter: (from) => !skip.has(basename(from)) });
		await symlink(join(example, "node_modules"), join(root, "node_modules"));
	}
	await rm(join(root, ".space"), { recursive: true, force: true });
	// Alchemy's state and local dev data, so each run starts empty.
	await rm(join(root, ".alchemy"), { recursive: true, force: true });
	await Effect.runPromise(Effect.flatMap(loadTarget(root), (target) => gen(root, "dev", target)));
	const data = await mkdtemp(join(tmpdir(), `space-${name}-`));
	return {
		root,
		data,
		cleanup: async () => {
			await rm(data, { recursive: true, force: true });
			if (options.copy) await rm(root, { recursive: true, force: true });
		},
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
