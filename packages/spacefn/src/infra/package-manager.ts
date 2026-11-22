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

/** The lockfile nearest `root` (a workspace's may be above it), and whose it is. */
export const findLockfile = (
	root: string,
): { readonly path: string; readonly manager: PackageManager } | undefined => {
	for (let dir = root; ; dir = dirname(dir)) {
		for (const [file, manager] of LOCKFILES)
			if (existsSync(join(dir, file))) return { path: join(dir, file), manager };
		if (dir === dirname(dir)) return undefined;
	}
};

/** The package manager whose lockfile is nearest `root`. Default npm. */
export const detectPackageManager = (root: string): PackageManager =>
	findLockfile(root)?.manager ?? "npm";

/** The command that installs what package.json says, changing the lockfile to match. */
export const installCommand = (manager: PackageManager): readonly string[] =>
	// pnpm freezes the lockfile in CI.
	manager === "pnpm" ? ["pnpm", "install", "--no-frozen-lockfile"] : [manager, "install"];

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
