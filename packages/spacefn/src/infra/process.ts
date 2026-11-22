import { spawn, spawnSync, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";

/**
 * The folder of an installed package, resolved from `from` (a file or folder).
 * Found in node_modules, as `require.resolve` can't see a package that exports
 * only for `import`, as spacefn does; else from its entry.
 */
export const packageDir = (from: string, name: string): string | undefined => {
	const require = createRequire(join(from, "noop.js"));
	for (const modules of require.resolve.paths(name) ?? []) {
		const dir = join(modules, name);
		if (existsSync(join(dir, "package.json"))) return realpathSync(dir);
	}
	let entry: string;
	try {
		entry = require.resolve(name);
	} catch {
		return undefined;
	}
	for (let dir = dirname(entry); dir !== dirname(dir); dir = dirname(dir)) {
		const file = join(dir, "package.json");
		if (
			existsSync(file) &&
			(JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name === name
		)
			return dir;
	}
	return undefined;
};

let ownDir: string | undefined;

/** spacefn's own folder, found from this file wherever the build put it (src/ or a dist/ chunk). */
export const spacefnDir = (): string => {
	if (ownDir) return ownDir;
	for (
		let dir = dirname(fileURLToPath(import.meta.url));
		dir !== dirname(dir);
		dir = dirname(dir)
	) {
		const file = join(dir, "package.json");
		if (
			existsSync(file) &&
			(JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name === "spacefn"
		)
			return (ownDir = dir);
	}
	throw new Error("spacefn: can't find its own package.json");
};

export interface RunOptions {
	readonly cwd: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly stdio?: StdioOptions;
	/** How long to wait after SIGTERM before SIGKILL, for tools that don't always exit. */
	readonly killAfterMs?: number;
}

/** Every process under `pid`, from `ps`. */
const descendants = (pid: number): number[] => {
	const ps = spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" });
	if (ps.status !== 0) return [];
	const children = new Map<number, number[]>();
	for (const line of ps.stdout.trim().split("\n")) {
		const [child, parent] = line.trim().split(/\s+/).map(Number) as [number, number];
		children.set(parent, [...(children.get(parent) ?? []), child]);
	}
	const found: number[] = [];
	for (let queue = [pid]; queue.length > 0;) {
		const next = children.get(queue.shift()!) ?? [];
		found.push(...next);
		queue.push(...next);
	}
	return found;
};

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const signal = (pids: readonly number[], name: NodeJS.Signals) => {
	for (const pid of pids)
		try {
			process.kill(pid, name);
		} catch {
			// Already gone.
		}
};

/**
 * Runs a command to its end and gives its exit code. Interrupting it (Ctrl-C
 * in the CLI) sends SIGTERM to it and every process it started, since tools
 * like `alchemy dev` don't pass the signal on, then SIGKILL to whatever hasn't
 * exited in time, and waits, so nothing is left running.
 */
export const run = (
	command: string,
	args: readonly string[],
	options: RunOptions,
): Effect.Effect<number, Error> =>
	Effect.callback<number, Error>((resume) => {
		const child: ChildProcess = spawn(command, args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			stdio: options.stdio ?? "inherit",
		});
		const exited = new Promise<void>((done) => child.once("exit", () => done()));
		child.once("error", (error) => resume(Effect.fail(error)));
		child.once("exit", (code, signal) => resume(Effect.succeed(code ?? (signal ? 1 : 0))));
		return Effect.promise(async () => {
			if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
			if (process.platform === "win32") {
				spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
				return await exited;
			}
			const tree = [child.pid, ...descendants(child.pid)];
			signal(tree, "SIGTERM");
			const end = Date.now() + (options.killAfterMs ?? 5_000);
			await Promise.race([exited, new Promise((r) => setTimeout(r, end - Date.now()))]);
			while (tree.some(alive) && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
			signal(tree.filter(alive), "SIGKILL");
			await exited;
		});
	});
