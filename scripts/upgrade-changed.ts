// Whether pack-check needs its slow part, upgrade-check.ts: whether anything that can break
// space upgrade changed since the last release's tag. In doubt, it does. The rest of what
// the CLI loads is tried by the fresh installs, which always run.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PATHS = [
	"packages/spacefn/src/infra",
	"packages/spacefn/tsdown.config.ts",
	// What an app that's upgraded starts with.
	"packages/create-spacefn/src/scaffold.ts",
	"scripts/pack-check.ts",
	"scripts/upgrade-changed.ts",
	"scripts/upgrade-check.ts",
];
// space upgrade installs both.
const MANIFESTS = ["packages/spacefn/package.json", "packages/docs/package.json"];
const WORKSPACE = "pnpm-workspace.yaml";

/** A manifest without what changes every release or isn't installed in an app. */
const installable = (text: string) =>
	JSON.stringify({ ...JSON.parse(text), version: undefined, devDependencies: undefined });

/** The catalog, which `pnpm pack` writes into the manifests as versions. */
const catalog = (text: string) => /^catalog:\n(?:[ \t].*(?:\n|$))*/m.exec(text)?.[0];

/** Why space upgrade needs checking in `repo`, or undefined if it doesn't. */
export const upgradeChange = (repo: string): string | undefined => {
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" });
	try {
		const tag = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*").trim();
		const [file] = git("diff", "--name-only", tag, "--", ...PATHS).split("\n");
		if (file) return `${file} changed since ${tag}`;

		const differs = (path: string, part: (text: string) => string | undefined) =>
			part(git("show", `${tag}:${path}`)) !== part(readFileSync(join(repo, path), "utf8"));
		for (const path of MANIFESTS)
			if (differs(path, installable)) return `${path} changed since ${tag}`;
		if (differs(WORKSPACE, catalog)) return `the catalog changed since ${tag}`;
		return undefined;
	} catch {
		return "can't compare with the last release's tag";
	}
};
