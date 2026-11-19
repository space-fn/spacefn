import { cpSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const template = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "template");

export type Target = "cloudflare" | "bun";
export const TARGETS: readonly Target[] = ["cloudflare", "bun"];

/** The spacefn packages, released together. */
export const SPACEFN_VERSION = "^0.11.0";

/** Everything else, at the versions this release was tested with. */
const VERSIONS: Readonly<Record<string, string>> = {
	effect: "^4.1.4",
	vite: "^8.3.8",
	typescript: "^7.0.2",
	vitest: "^5.1.1",
	"@alchemy.run/cloudflare": "2.0.0-beta.87",
	"@alchemy.run/docker": "2.0.0-beta.87",
};

/** The ones the spacefn repo's catalog pins, for the playground. */
const CATALOG = new Set([
	"effect",
	"vite",
	"vitest",
	"@alchemy.run/cloudflare",
	"@alchemy.run/docker",
]);

export interface ScaffoldOptions {
	readonly name: string;
	readonly target: Target;
	/**
	 * Inside the spacefn repo: spacefn packages as `workspace:*` and the
	 * cataloged ones from the catalog, for the playground.
	 */
	readonly workspace?: boolean;
}

const sorted = (record: Record<string, string>) =>
	Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

/** The app's package.json: its target's runtime and Alchemy provider. */
export const packageJson = ({ name, target, workspace }: ScaffoldOptions) => {
	const spacefn = (pkg: string) => [pkg, workspace ? "workspace:*" : SPACEFN_VERSION] as const;
	const other = (pkg: string) =>
		[pkg, workspace && CATALOG.has(pkg) ? "catalog:" : VERSIONS[pkg]!] as const;
	return {
		name,
		private: true,
		type: "module",
		scripts: {
			// .space/ is generated; make it as soon as dependencies are in.
			postinstall: "space gen",
			dev: "space dev",
			build: "space build",
			deploy: "space deploy",
			test: "vitest run --config configs/vitest.config.ts",
			typecheck: "tsc --noEmit",
		},
		dependencies: sorted(
			Object.fromEntries([
				spacefn("spacefn"),
				spacefn(target === "cloudflare" ? "@spacefn/cloudflare" : "@spacefn/bun"),
				other("effect"),
			]),
		),
		devDependencies: sorted(
			Object.fromEntries([
				spacefn("@spacefn/infra"),
				other(target === "cloudflare" ? "@alchemy.run/cloudflare" : "@alchemy.run/docker"),
				other("typescript"),
				other("vite"),
				other("vitest"),
			]),
		),
	};
};

const spaceConfig = (target: Target) =>
	[
		'import { defineSpace } from "spacefn/config";',
		"",
		"// The app's name comes from package.json. See the docs for aliases and database drivers.",
		`export default defineSpace({ target: ${JSON.stringify(target)} });`,
		"",
	].join("\n");

/** Copies the template into `dir` and sets it up for `options.target`. */
export function scaffold(dir: string, options: ScaffoldOptions): void {
	if (existsSync(dir)) throw new Error(`${dir} already exists`);
	mkdirSync(dir, { recursive: true });
	cpSync(template, dir, { recursive: true });
	// npm drops .gitignore files from packages, so the template ships it as gitignore.
	renameSync(resolve(dir, "gitignore"), resolve(dir, ".gitignore"));
	writeFileSync(
		resolve(dir, "package.json"),
		`${JSON.stringify(packageJson(options), null, "\t")}\n`,
	);
	writeFileSync(resolve(dir, "configs", "space.ts"), spaceConfig(options.target));
}
