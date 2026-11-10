import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { constants } from "node:os";
import { dirname, join } from "node:path";

/**
 * Finds the file that a package's bin points to, searching node_modules from
 * `from`. Running that file with node works with any package manager, where
 * `pnpm exec` only works with pnpm.
 */
export function resolveBin(pkg: string, bin: string, from: string): string {
	const requireFrom = createRequire(from);
	let pkgPath: string;
	try {
		pkgPath = requireFrom.resolve(`${pkg}/package.json`);
	} catch {
		throw new Error(`${pkg} is not installed. Install the app's dependencies first.`);
	}
	const manifest = JSON.parse(readFileSync(pkgPath, "utf8")) as {
		bin?: string | Record<string, string>;
	};
	const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
	if (!entry) throw new Error(`${pkg} declares no "${bin}" bin. Reinstall dependencies.`);
	return join(dirname(pkgPath), entry);
}

/**
 * Runs a bin file with node and resolves to its exit code. A process stopped by
 * a signal is a failure, reported as 128 + the signal number as a shell does.
 */
export function runBin(binPath: string, args: string[], cwd: string): Promise<number> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [binPath, ...args], { cwd, stdio: "inherit" });
		child.on("error", fail);
		child.on("exit", (code, signal) => {
			if (signal) {
				console.error(`Stopped by ${signal}.`);
				done(128 + constants.signals[signal]);
				return;
			}
			done(code ?? 1);
		});
	});
}
