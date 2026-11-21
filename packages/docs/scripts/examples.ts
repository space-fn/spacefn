// Before packing: copies the repo's examples/ into this package, so an installed
// spacefn-docs has them next to content/, for people and coding agents to read.
// Generated and installed files are left out, and workspace: and catalog: versions,
// which only the repo can resolve, become the released ones.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const here = resolve(import.meta.dirname, "..");
const repo = resolve(here, "..", "..");
const from = join(repo, "examples");
const to = join(here, "examples");

const SKIP = new Set(["node_modules", ".space", ".alchemy", "dist", ".env", ".DS_Store"]);
const { version } = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as {
	version: string;
};

/** The `catalog:` section of pnpm-workspace.yaml: `  name: version` lines. */
const catalog = (() => {
	const versions = new Map<string, string>();
	let inside = false;
	for (const line of readFileSync(join(repo, "pnpm-workspace.yaml"), "utf8").split("\n")) {
		if (/^\S/.test(line)) inside = line.startsWith("catalog:");
		const entry = inside && /^\s+"?([^":]+)"?:\s*(\S+)/.exec(line);
		if (entry) versions.set(entry[1]!, entry[2]!);
	}
	return versions;
})();

const released = (name: string, range: string) => {
	if (range.startsWith("workspace:")) return `^${version}`;
	if (range !== "catalog:") return range;
	const pinned = catalog.get(name);
	if (!pinned) throw new Error(`examples: ${name} is catalog: but not in the catalog`);
	return pinned;
};

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (path) => !SKIP.has(basename(path)) });
const examples = readdirSync(to).filter((name) => existsSync(join(to, name, "package.json")));
for (const example of examples) {
	const file = join(to, example, "package.json");
	const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
	for (const field of ["dependencies", "devDependencies"]) {
		const deps = manifest[field] as Record<string, string> | undefined;
		for (const [name, range] of Object.entries(deps ?? {})) deps![name] = released(name, range);
	}
	writeFileSync(file, `${JSON.stringify(manifest, null, "\t")}\n`);
}
console.log(`examples: copied ${examples.length} into spacefn-docs`);
