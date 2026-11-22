// space upgrade as users run it, for pack-check: packed spacefn, published to a registry
// of our own at an old and a new version, upgraded by npm, pnpm and Bun. Anything else
// the apps install comes from npm.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

const NPM = "https://registry.npmjs.org";
const OLD = "0.0.1";
const NEW = "99.0.0";
/** A release that can't install, for the rollback. */
const BROKEN = "99.0.1";
// An Alchemy and an Effect before the ones the new release needs.
const OLD_ALCHEMY = "2.0.0-beta.86";
const OLD_EFFECT = "4.1.4";

interface Manifest {
	name: string;
	version: string;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	peerDependencies: Record<string, string>;
}

const readJson = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T;
const writeJson = (file: string, value: unknown) =>
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);

const output = (command: string, args: readonly string[]) => {
	const result = spawnSync(command, args, { encoding: "utf8" });
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
};

/** Publishes `tarball` to the registry's folder as `version`, its manifest changed by `edit`. */
const republish = (
	dir: string,
	tarball: string,
	version: string,
	edit?: (manifest: Manifest) => void,
) => {
	const out = mkdtempSync(join(dir, "release-"));
	output("tar", ["-xzf", tarball, "-C", out]);
	const file = join(out, "package", "package.json");
	const manifest = readJson<Manifest>(file);
	manifest.version = version;
	edit?.(manifest);
	writeJson(file, manifest);
	const packed = `${manifest.name}-${version}.tgz`;
	output("tar", ["-czf", join(dir, packed), "-C", out, "package"]);
	const bytes = readFileSync(join(dir, packed));
	const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
	const shasum = createHash("sha1").update(bytes).digest("hex");
	return { manifest, packed, integrity, shasum };
};

/** Upgrades an app made by the packed `scaffolder` with each package manager. */
export const checkUpgrade = async (
	work: string,
	tarballs: { readonly spacefn: string; readonly docs: string; readonly scaffolder: string },
) => {
	const dir = mkdtempSync(join(work, "upgrade-"));
	const effect = output("npm", ["view", "effect@latest", "version", `--registry=${NPM}`]);
	let alchemy = "";
	const needs = (version: string) => (manifest: Manifest) => {
		alchemy ||= manifest.dependencies.alchemy!;
		const pinned = version === OLD ? OLD_ALCHEMY : version === NEW ? alchemy : "0.0.0-missing";
		manifest.dependencies.alchemy = pinned;
		for (const name of Object.keys(manifest.peerDependencies))
			if (name.startsWith("@alchemy.run/")) manifest.peerDependencies[name] = pinned;
		manifest.peerDependencies.effect = `^${version === OLD ? OLD_EFFECT : effect}`;
	};
	const releases = [OLD, NEW, BROKEN].flatMap((version) => [
		republish(dir, tarballs.spacefn, version, needs(version)),
		republish(dir, tarballs.docs, version),
	]);

	let latest = NEW;
	const server = createServer((request, response) => {
		const path = decodeURIComponent(request.url!.split("?")[0]!).slice(1);
		const own = releases.filter(({ manifest }) => manifest.name === path);
		const file = releases.find(({ packed }) => path === `-t/${packed}`);
		if (file) return response.end(readFileSync(join(dir, file.packed)));
		if (own.length === 0) return response.writeHead(307, { location: NPM + request.url }).end();
		const versions = own.map(({ manifest, packed, integrity, shasum }) => [
			manifest.version,
			{ ...manifest, dist: { tarball: `${registry}/-t/${packed}`, integrity, shasum } },
		]);
		const time = own.map(({ manifest }) => [manifest.version, "2026-01-01T00:00:00.000Z"]);
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({
				name: path,
				"dist-tags": { latest },
				versions: Object.fromEntries(versions),
				time: Object.fromEntries(time),
			}),
		);
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const env = {
		...process.env,
		npm_config_registry: registry,
		pnpm_config_registry: registry,
		BUN_CONFIG_REGISTRY: registry,
		npm_config_cache: join(dir, "cache", "npm"),
		BUN_INSTALL_CACHE_DIR: join(dir, "cache", "bun"),
		pnpm_config_store_dir: join(dir, "cache", "pnpm-store"),
		pnpm_config_cache_dir: join(dir, "cache", "pnpm"),
		// The releases are seconds old, and workerd's install script isn't needed.
		pnpm_config_minimum_release_age: "0",
		pnpm_config_strict_dep_builds: "false",
	};
	// Async: the registry answers from this process.
	const sh = (cwd: string, command: string, args: readonly string[]) =>
		new Promise<number | null>((done, fail) => {
			console.log(`$ ${[command, ...args].join(" ")}`);
			const stdio = ["ignore", "inherit", "inherit"] as const;
			const child = spawn(command, args, { cwd, env, stdio: [...stdio], timeout: 300_000 });
			child.once("error", fail);
			child.once("exit", done);
		});

	const cases = [
		["npm", "npm", "package-lock.json", false],
		// As apps whose own space upgrade is older than the fix run it.
		["npx", "npm", "package-lock.json", true],
		["pnpm", "pnpm", "pnpm-lock.yaml", false],
		["bun", "bun", "bun.lock", false],
	] as const;
	try {
		for (const [label, manager, lockfile, npx] of cases) {
			const parent = join(dir, label);
			mkdirSync(parent);
			const scaffold = [tarballs.scaffolder, "app", "--target", "cloudflare", "--no-lint"];
			if ((await sh(parent, "node", scaffold)) !== 0) throw new Error("scaffolding failed");
			const app = join(parent, "app");
			const file = join(app, "package.json");

			const install = async (spacefn: string, effectRange: string) => {
				const manifest = readJson<Manifest>(file);
				manifest.dependencies.spacefn = spacefn;
				manifest.dependencies.effect = effectRange;
				manifest.devDependencies["spacefn-docs"] = spacefn;
				manifest.devDependencies.alchemy = OLD_ALCHEMY;
				manifest.devDependencies["@alchemy.run/cloudflare"] = OLD_ALCHEMY;
				writeJson(file, manifest);
				if ((await sh(app, manager, ["install"])) !== 0)
					throw new Error(`${label}: the old app didn't install`);
			};
			// Locked to the old versions, under the ranges a scaffolded app has.
			await install(OLD, OLD_EFFECT);
			await install(`^${OLD}`, `^${OLD_EFFECT}`);

			const upgrade = () =>
				npx
					? sh(app, "npx", ["--yes", "spacefn@latest", "upgrade"])
					: sh(app, join(app, "node_modules", ".bin", "space"), ["upgrade"]);
			const installed = (name: string) =>
				readJson<Manifest>(join(app, "node_modules", name, "package.json")).version;
			const expectVersions = (expected: Record<string, string>) => {
				for (const [name, version] of Object.entries(expected))
					if (installed(name) !== version)
						throw new Error(`${label}: ${name} is ${installed(name)}, not ${version}`);
			};

			// npm may have moved effect already, as its range allows; a rollback restores what was there.
			const effectBefore = installed("effect");
			latest = BROKEN;
			const [manifestBefore, lockBefore] = [file, join(app, lockfile)].map((f) => readFileSync(f));
			if ((await upgrade()) === 0) throw new Error(`${label}: a broken release upgraded`);
			if (!readFileSync(file).equals(manifestBefore!))
				throw new Error(`${label}: a failed upgrade changed package.json`);
			if (!readFileSync(join(app, lockfile)).equals(lockBefore!))
				throw new Error(`${label}: a failed upgrade changed ${lockfile}`);
			expectVersions({
				spacefn: OLD,
				"spacefn-docs": OLD,
				alchemy: OLD_ALCHEMY,
				effect: effectBefore,
			});

			latest = NEW;
			if ((await upgrade()) !== 0) throw new Error(`${label}: space upgrade failed`);
			expectVersions({
				spacefn: NEW,
				"spacefn-docs": NEW,
				alchemy,
				"@alchemy.run/cloudflare": alchemy,
				effect,
			});
			if (readJson<Manifest>(file).dependencies.spacefn !== `^${NEW}`)
				throw new Error(`${label}: package.json doesn't ask for spacefn ^${NEW}`);
			for (const script of ["typecheck", "test"])
				if ((await sh(app, manager, ["run", script])) !== 0)
					throw new Error(`${label}: ${script} failed after the upgrade`);
			if ((await upgrade()) !== 0) throw new Error(`${label}: upgrading again failed`);
			console.log(`✓ space upgrade with ${label}: upgrades, and rolls back a failed upgrade`);
		}
	} finally {
		server.closeAllConnections();
		server.close();
	}
};
