// space upgrade: what moves with a spacefn release, and installing it all at once.
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { Console, Effect, Exit } from "effect";
import { SpaceError } from "spacefn";

import { DOCS_PACKAGE } from "./docs.ts";
import { findLockfile, installCommand, type PackageManager } from "./package-manager.ts";
import { packageDir, run } from "./process.ts";

interface PackageJson {
	readonly version?: string;
	readonly bin?: Readonly<Record<string, string>>;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface Release extends PackageJson {
	readonly version: string;
}

export interface Change {
	readonly field: "dependencies" | "devDependencies";
	readonly name: string;
	readonly from: string;
	readonly to: string;
}

const EXACT = /^\d+\.\d+\.\d+(-[\w.-]+)?$/;

/** The lowest version a range takes, for the ranges package managers write. */
const floorOf = (range: string): string | undefined => {
	const match = /^(?:\^|~|>=|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+)(-[\w.-]+)?)?(?=\s|$)/.exec(
		range.trim(),
	);
	if (!match) return undefined;
	const [, major, minor = "0", patch = "0", pre = ""] = match;
	return `${major}.${minor}.${patch}${pre}`;
};

/** Orders two versions as semver does: a release is above its prereleases. */
const compareVersions = (a: string, b: string): number => {
	const split = (version: string) => {
		const [core = "", ...pre] = version.split("-");
		return { core, pre: pre.join("-") };
	};
	const [left, right] = [split(a), split(b)];
	const numeric = { numeric: true };
	return (
		left.core.localeCompare(right.core, "en", numeric) ||
		Number(left.pre === "") - Number(right.pre === "") ||
		left.pre.localeCompare(right.pre, "en", numeric)
	);
};

/**
 * What an upgrade to `release` changes in the app's package.json: spacefn and
 * its docs, Alchemy and the providers released with it, and the peers the
 * release needs newer. Pins stay pins; everything else is the app's choice.
 */
export const upgradePlan = (app: PackageJson, release: Release): Change[] => {
	const all = { ...app.devDependencies, ...app.dependencies };
	const own = floorOf(all.spacefn ?? "");
	if (own && compareVersions(own, release.version) > 0) return [];

	const alchemy = release.dependencies?.alchemy;
	const wanted = (name: string, from: string) => {
		if (name === "spacefn" || name === DOCS_PACKAGE) return `^${release.version}`;
		if (name === "alchemy") return alchemy;
		const peer = release.peerDependencies?.[name];
		if (peer) return peer;
		// Other providers are released with Alchemy, at its version.
		return name.startsWith("@alchemy.run/") && from === all.alchemy ? alchemy : undefined;
	};

	const uneditable: string[] = [];
	const changes = (["dependencies", "devDependencies"] as const).flatMap((field) =>
		Object.entries(app[field] ?? {}).flatMap(([name, from]): Change[] => {
			const target = wanted(name, from);
			if (!target || target === from) return [];
			const [current, needed] = [floorOf(from), floorOf(target)];
			if (!current || !needed) {
				uneditable.push(`${name}@${from}`);
				return [];
			}
			const exact = EXACT.test(target);
			// A range is a minimum, so a newer version stays; an exact one must match.
			if (!exact && compareVersions(current, needed) >= 0) return [];
			const to = EXACT.test(from) ? needed : target;
			return to === from ? [] : [{ field, name, from, to }];
		}),
	);
	if (uneditable.length > 0)
		throw new SpaceError({
			code: "UPGRADE_UNEDITABLE",
			message: `Can't upgrade ${uneditable.join(", ")}: not a version or range`,
			file: "package.json",
			hint: `Set those yourself to what spacefn ${release.version} needs (npm view spacefn@${release.version}).`,
		});
	return changes;
};

/** The commands around writing package.json: `before` it, then one install. */
export const upgradeSteps = (manager: PackageManager, names: readonly string[]) => ({
	// npm resolves against its installed tree, where the old peers conflict with the new.
	before: manager === "npm" ? [["npm", "uninstall", "--ignore-scripts", ...names]] : [],
	install: installCommand(manager),
});

export const readPackageJson = async (dir: string): Promise<PackageJson> =>
	JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson;

/** The installed spacefn as the app at `root` sees it. */
export const installedSpacefn = async (root: string): Promise<PackageJson | undefined> => {
	const dir = packageDir(root, "spacefn");
	return dir ? readPackageJson(dir) : undefined;
};

/** The latest release, from the registry the app's .npmrc names. */
const latestRelease = (root: string) =>
	Effect.tryPromise({
		try: async () => {
			const args = ["view", "spacefn@latest", "version", "dependencies", "peerDependencies"];
			const { stdout } = await promisify(execFile)("npm", [...args, "--json"], { cwd: root });
			const release = JSON.parse(stdout) as Release;
			if (!release.version) throw new Error("the registry gave no version");
			return release;
		},
		catch: (cause) =>
			new SpaceError({
				code: "UPGRADE_LOOKUP",
				message: `Can't read spacefn's latest release: ${cause instanceof Error ? cause.message : String(cause)}`,
				hint: "Check the network and the registry in .npmrc. Nothing was changed.",
			}),
	});

/** Fails unless each change is what got installed. */
const checkInstalled = Effect.fn(function* (root: string, changes: readonly Change[]) {
	for (const { name, to } of changes) {
		const dir = packageDir(root, name);
		const version = dir
			? (yield* Effect.tryPromise(() => readPackageJson(dir))).version
			: undefined;
		const order = version ? compareVersions(version, floorOf(to)!) : -1;
		if (order < 0 || (order > 0 && EXACT.test(to)))
			return yield* new SpaceError({
				code: "UPGRADE_INCOMPLETE",
				message: `${name} should be ${to}, but ${version ?? "none"} is installed`,
			});
	}
});

const runStep = Effect.fn(function* (root: string, command: readonly string[], label?: string) {
	const shown = label ?? command.join(" ");
	yield* Console.log(`$ ${shown}`);
	const [bin, ...args] = command;
	const code = yield* run(bin!, args, { cwd: root });
	if (code !== 0)
		return yield* new SpaceError({
			code: "UPGRADE_FAILED",
			message: `${shown} exited ${code}`,
		});
});

/**
 * Makes the changes and installs them. If that fails or is interrupted,
 * package.json and the lockfile go back, and what they say is installed again.
 */
const applyChanges = Effect.fn(function* (root: string, changes: readonly Change[]) {
	const file = join(root, "package.json");
	const lock = findLockfile(root);
	const manager = lock?.manager ?? "npm";
	const text = yield* Effect.tryPromise(() => readFile(file, "utf8"));
	const locked = lock ? yield* Effect.tryPromise(() => readFile(lock.path)) : undefined;

	const next = JSON.parse(text) as Record<Change["field"], Record<string, string>>;
	for (const { field, name, to } of changes) next[field][name] = to;
	const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "\t";
	const steps = upgradeSteps(manager, [...new Set(changes.map((change) => change.name))]);

	const restore = Effect.gen(function* () {
		yield* Console.error("space upgrade: putting package.json and the lockfile back");
		yield* Effect.tryPromise(async () => {
			await writeFile(file, text);
			if (lock && locked) await writeFile(lock.path, locked);
			else {
				const created = findLockfile(root);
				if (created) await rm(created.path);
			}
		});
		yield* runStep(root, steps.install);
	}).pipe(
		Effect.catch(() =>
			Console.error(
				`space upgrade: couldn't finish putting it back; run ${steps.install.join(" ")}`,
			),
		),
	);

	yield* Effect.gen(function* () {
		for (const command of steps.before) yield* runStep(root, command);
		yield* Effect.tryPromise(() => writeFile(file, `${JSON.stringify(next, null, indent)}\n`));
		yield* runStep(root, steps.install);
		yield* checkInstalled(root, changes);
	}).pipe(Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : restore)));
});

/** `space upgrade`. */
export const upgrade = Effect.fn(function* (root: string) {
	const app = yield* Effect.tryPromise({
		try: () => readPackageJson(root),
		catch: () =>
			new SpaceError({
				code: "UPGRADE_NO_APP",
				message: "Can't read package.json",
				hint: "Run it from the app's root.",
			}),
	});
	if (!app.dependencies?.spacefn && !app.devDependencies?.spacefn)
		return yield* new SpaceError({
			code: "UPGRADE_NO_SPACEFN",
			message: "spacefn isn't in package.json",
		});

	const release = yield* latestRelease(root);
	const changes = yield* Effect.try({
		try: () => upgradePlan(app, release),
		catch: (error) => error as SpaceError,
	});
	if (changes.length === 0)
		return yield* Console.log(`space upgrade: nothing to change (latest is ${release.version})`);

	const width = Math.max(...changes.map((change) => change.name.length));
	for (const { name, from, to } of changes)
		yield* Console.log(`  ${name.padEnd(width)}  ${from} → ${to}`);
	yield* applyChanges(root, changes);

	// The new spacefn's gen: this process is still the old one, whose files the install replaced.
	const installed = yield* Effect.tryPromise(() => installedSpacefn(root));
	const dir = packageDir(root, "spacefn");
	const bin = installed?.bin?.space;
	if (!dir || !bin)
		return yield* new SpaceError({
			code: "UPGRADE_INCOMPLETE",
			message: "The installed spacefn has no space command",
		});
	yield* runStep(root, [process.execPath, join(dir, bin), "gen"], "space gen");
	yield* Console.log("space upgrade: done");
});
