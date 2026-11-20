import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { addCommand, type PackageManager } from "./package-manager.ts";
import { packageDir } from "./process.ts";

interface PackageJson {
	readonly version?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

const isSpacefn = (name: string) => name === "spacefn";
const isProvider = (name: string) => name.startsWith("@alchemy.run/");

const commandsFor = (
	manager: PackageManager,
	app: PackageJson,
	pick: (name: string) => string | undefined,
) =>
	(["dependencies", "devDependencies"] as const).flatMap((field) => {
		const specs = Object.keys(app[field] ?? {}).flatMap((name) => {
			const version = pick(name);
			return version ? [`${name}@${version}`] : [];
		});
		return specs.length > 0 ? [addCommand(manager, specs, field === "devDependencies")] : [];
	});

/** Step one of `space upgrade`: spacefn, to its latest version. */
export const spacefnUpgrades = (manager: PackageManager, app: PackageJson) =>
	commandsFor(manager, app, (name) => (isSpacefn(name) ? "latest" : undefined));

/**
 * Step two, once the new spacefn is installed: the Alchemy provider the app
 * has, to the version the new spacefn expects, and its docs, to its version.
 */
export const providerUpgrades = (manager: PackageManager, app: PackageJson, spacefn: PackageJson) =>
	commandsFor(manager, app, (name) =>
		isProvider(name)
			? spacefn.peerDependencies?.[name]
			: name === "@spacefn/docs"
				? spacefn.version
				: undefined,
	);

export const readPackageJson = async (dir: string): Promise<PackageJson> =>
	JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson;

/** The installed spacefn as the app at `root` sees it. */
export const installedSpacefn = async (root: string): Promise<PackageJson | undefined> => {
	const dir = packageDir(root, "spacefn");
	return dir ? readPackageJson(dir) : undefined;
};
