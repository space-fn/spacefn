import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const template = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "template");

/** Template entries that are local test residue and never belong in a scaffold. */
const residue = new Set([".space", ".cloudflare", "node_modules", "dist"]);

/** Copies the project template into `target` and personalizes it with `name`. */
export function scaffold(target: string, name: string): void {
	if (existsSync(target)) {
		throw new Error(`${target} already exists`);
	}
	mkdirSync(target, { recursive: true });
	cpSync(template, target, {
		recursive: true,
		filter: (src) => !residue.has(basename(src)),
	});
	// npm strips `.gitignore` files from published packages, so the template
	// ships it as `gitignore` and we rename it back here.
	renameSync(resolve(target, "gitignore"), resolve(target, ".gitignore"));

	const pkgPath = resolve(target, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string };
	pkg.name = name;
	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
}
