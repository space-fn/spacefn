import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export type PackageManager = "pnpm" | "bun" | "yarn" | "npm";

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
	["pnpm-lock.yaml", "pnpm"],
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
];

/** The package manager whose lockfile is nearest `root` (a workspace's may be above it). Default npm. */
export const detectPackageManager = (root: string): PackageManager => {
	for (let dir = root; ; dir = dirname(dir)) {
		for (const [file, manager] of LOCKFILES) if (existsSync(join(dir, file))) return manager;
		if (dir === dirname(dir)) return "npm";
	}
};

/** The command that adds `specs` (`name@version`) as dependencies, or dev dependencies. */
export const addCommand = (
	manager: PackageManager,
	specs: readonly string[],
	dev: boolean,
): readonly string[] => {
	const verb = manager === "npm" ? "install" : "add";
	const flag = dev ? (manager === "npm" ? "--save-dev" : "-D") : undefined;
	return [manager, verb, ...(flag ? [flag] : []), ...specs];
};
