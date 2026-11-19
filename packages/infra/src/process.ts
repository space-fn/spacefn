import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { Effect } from "effect";

/**
 * The folder of an installed package, resolved from `from` (a file or folder).
 * Found from its entry, since not every package exports `package.json`.
 */
export const packageDir = (from: string, name: string): string | undefined => {
	let entry: string;
	try {
		entry = createRequire(join(from, "noop.js")).resolve(name);
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

export interface RunOptions {
	readonly cwd: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly stdio?: StdioOptions;
	/** How long to wait after SIGTERM before SIGKILL, for tools that don't always exit. */
	readonly killAfterMs?: number;
}

/**
 * Runs a command to its end and gives its exit code. Interrupting it (Ctrl-C
 * in the CLI) sends SIGTERM, then SIGKILL if it hasn't exited in time, and
 * waits for it to exit, so nothing is left running.
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
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGTERM");
			const timer = setTimeout(() => child.kill("SIGKILL"), options.killAfterMs ?? 5_000);
			await exited;
			clearTimeout(timer);
		});
	});
