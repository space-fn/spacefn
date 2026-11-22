import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const own = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const template = resolve(own, "template");
/** What differs by target: `configs/infra.ts`, and on Bun `configs/Dockerfile`. */
const targets = resolve(own, "targets");

export type Target = "cloudflare" | "bun";
export const TARGETS: readonly Target[] = ["cloudflare", "bun"];

/** The spacefn release this scaffolder ships with: they're released together, at one version. */
export const SPACEFN_VERSION = `^${(JSON.parse(readFileSync(resolve(own, "package.json"), "utf8")) as { version: string }).version}`;

/** Everything else, at the versions this release was tested with. */
const VERSIONS: Readonly<Record<string, string>> = {
	effect: "^4.1.4",
	vite: "^8.3.8",
	typescript: "^7.0.2",
	vitest: "^5.1.1",
	alchemy: "2.0.0-beta.87",
	"@alchemy.run/cloudflare": "2.0.0-beta.87",
	"@alchemy.run/docker": "2.0.0-beta.87",
	oxlint: "^1.94.0",
	oxfmt: "^0.79.0",
};

/** The ones the spacefn repo's catalog pins, for the starter examples. */
const CATALOG = new Set([
	"alchemy",
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
	 * cataloged ones from the catalog, for the starter examples.
	 */
	readonly workspace?: boolean;
	/** Adds oxlint and oxfmt, with their configs in `configs/` and `lint`, `fmt` and `check` scripts. */
	readonly lint?: boolean;
}

const sorted = (record: Record<string, string>) =>
	Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

/** The app's package.json: Alchemy and its target's provider, for `configs/infra.ts`. */
export const packageJson = ({ name, target, workspace, lint }: ScaffoldOptions) => {
	const other = (pkg: string) =>
		[pkg, workspace && CATALOG.has(pkg) ? "catalog:" : VERSIONS[pkg]!] as const;
	return {
		name,
		private: true,
		type: "module",
		// Imports from the app root: configs/env.ts, features in modules/, shared code in lib/, and .space/.
		imports: {
			"#configs/*": "./configs/*",
			"#lib/*": "./lib/*",
			"#modules/*": "./modules/*",
			"#space/*": "./.space/*",
		},
		scripts: {
			// .space/ is generated; make it as soon as dependencies are in.
			postinstall: "space gen",
			dev: "space dev",
			build: "space build",
			deploy: "space deploy",
			docs: "space docs",
			test: "vitest run --config configs/vitest.ts",
			typecheck: "tsc --noEmit",
			...(lint ? LINT_SCRIPTS : {}),
		},
		dependencies: sorted(
			Object.fromEntries([
				["spacefn", workspace ? "workspace:*" : SPACEFN_VERSION],
				other("effect"),
			]),
		),
		devDependencies: sorted(
			Object.fromEntries([
				other("alchemy"),
				other(target === "cloudflare" ? "@alchemy.run/cloudflare" : "@alchemy.run/docker"),
				// The reader and spacefn's docs, at spacefn's version.
				["spacefn-docs", workspace ? "workspace:*" : SPACEFN_VERSION],
				...(lint ? [other("oxfmt"), other("oxlint")] : []),
				other("typescript"),
				other("vite"),
				other("vitest"),
			]),
		),
	};
};

/** The scripts oxlint and oxfmt add. Both read `.gitignore`, so `.space/` and `dist/` are skipped. */
const LINT_SCRIPTS = {
	lint: "oxlint -c configs/oxlint.json",
	fmt: "oxfmt -c configs/oxfmt.json",
	check: "oxfmt -c configs/oxfmt.json --check && oxlint -c configs/oxlint.json && tsc --noEmit",
};

/** oxlint's settings: its default rules, and unused code as an error. */
const oxlintConfig = `${JSON.stringify(
	{
		$schema: "../node_modules/oxlint/configuration_schema.json",
		rules: { "no-unused-vars": "error" },
	},
	null,
	"\t",
)}\n`;

/** oxfmt's settings: the style the new app is written in, so it starts formatted. */
const oxfmtConfig = `${JSON.stringify(
	{
		$schema: "../node_modules/oxfmt/configuration_schema.json",
		useTabs: true,
		trailingComma: "all",
		sortImports: true,
		sortPackageJson: true,
	},
	null,
	"\t",
)}\n`;

/** With oxlint and oxfmt, AGENTS.md and the README say to run `check`. */
const withLint = (dir: string) => {
	writeFileSync(resolve(dir, "configs", "oxlint.json"), oxlintConfig);
	writeFileSync(resolve(dir, "configs", "oxfmt.json"), oxfmtConfig);
	const replace = (file: string, from: string, to: string) => {
		const path = resolve(dir, file);
		const text = readFileSync(path, "utf8");
		if (!text.includes(from)) throw new Error(`${file} has no "${from}" to replace`);
		writeFileSync(path, text.replace(from, to));
	};
	replace(
		"AGENTS.md",
		"Check your work with `npm run typecheck` and `npm test`",
		"Check your work with `npm run check` (format, lint and types) and `npm test`; `npm run fmt` formats",
	);
	replace(
		"README.md",
		"| `npm test`         | Runs the tests                                                            |\n",
		"| `npm test`         | Runs the tests                                                            |\n" +
			"| `npm run check`    | Checks formatting (oxfmt), lint (oxlint) and types                        |\n" +
			"| `npm run fmt`      | Formats the code with oxfmt                                               |\n",
	);
};

/** The app's Vite config: spacefn's plugin, for the target. Add your own plugins beside it. */
const viteConfig = (target: Target) =>
	[
		'import { space } from "spacefn/vite";',
		'import { defineConfig } from "vite";',
		"",
		`export default defineConfig({ plugins: [space({ target: ${JSON.stringify(target)} })] });`,
		"",
	].join("\n");

/** The database's settings: D1 on Cloudflare, a libSQL file or server on Bun. */
const dbConfig = (target: Target) =>
	`${JSON.stringify(
		{
			$schema: "../../../node_modules/spacefn/schemas/db.json",
			driver: target === "cloudflare" ? "d1" : "libsql",
			migrateOn: "startup",
		},
		null,
		"\t",
	)}\n`;

/** Copies the template into `dir` and sets it up for `options.target`. */
export function scaffold(dir: string, options: ScaffoldOptions): void {
	if (existsSync(dir)) throw new Error(`${dir} already exists`);
	mkdirSync(dir, { recursive: true });
	cpSync(template, dir, { recursive: true });
	cpSync(resolve(targets, options.target), dir, { recursive: true });
	// npm drops .gitignore files from packages, so the template ships it as gitignore.
	renameSync(resolve(dir, "gitignore"), resolve(dir, ".gitignore"));
	writeFileSync(
		resolve(dir, "package.json"),
		`${JSON.stringify(packageJson(options), null, "\t")}\n`,
	);
	writeFileSync(resolve(dir, "configs", "vite.ts"), viteConfig(options.target));
	writeFileSync(resolve(dir, "app", "db", "main", "config.json"), dbConfig(options.target));
	if (options.lint) withLint(dir);
}
