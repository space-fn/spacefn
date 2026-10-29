import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

type PackageJson = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
};

/** Syncs framework dependencies and docs from a create-spacefn template. */
export async function applyUpgradeTemplate(root: string, template: string): Promise<string[]> {
	const packagePath = resolve(root, "package.json");
	const packageText = await readFile(packagePath, "utf8");
	const pkg = JSON.parse(packageText) as PackageJson;
	const templatePkg = JSON.parse(
		await readFile(join(template, "package.json"), "utf8"),
	) as PackageJson;
	const supportedDependencies = {
		...templatePkg.dependencies,
		...templatePkg.devDependencies,
	};
	const updated: string[] = [];

	for (const [name, version] of Object.entries(supportedDependencies)) {
		const group = pkg.dependencies?.[name] !== undefined ? pkg.dependencies : pkg.devDependencies;
		if (group?.[name] !== undefined && group[name] !== version) {
			group[name] = version;
			updated.push(name);
		}
	}

	const docsSource = join(template, "docs", "spacefn");
	const docsTarget = resolve(root, "docs", "spacefn");
	await readdir(docsSource);
	await mkdir(dirname(docsTarget), { recursive: true });
	await rm(docsTarget, { recursive: true, force: true });
	await cp(docsSource, docsTarget, { recursive: true });

	const indent = /^\t/m.test(packageText) ? "\t" : 2;
	await writeFile(packagePath, `${JSON.stringify(pkg, null, indent)}\n`);
	return updated.sort();
}

function run(command: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, { cwd, stdio: "inherit" });
		child.once("error", rejectRun);
		child.once("close", (code) => {
			if (code === 0) resolveRun();
			else rejectRun(new Error(`${command} exited with code ${code ?? 1}`));
		});
	});
}

async function installCommand(root: string): Promise<[string, string[]]> {
	const entries = new Set(await readdir(root));
	if (entries.has("pnpm-lock.yaml")) return ["pnpm", ["install"]];
	if (entries.has("package-lock.json")) return ["npm", ["install"]];
	if (entries.has("yarn.lock")) return ["yarn", ["install"]];
	if (entries.has("bun.lock") || entries.has("bun.lockb")) return ["bun", ["install"]];

	const userAgent = process.env.npm_config_user_agent ?? "";
	if (userAgent.startsWith("pnpm/")) return ["pnpm", ["install"]];
	if (userAgent.startsWith("yarn/")) return ["yarn", ["install"]];
	if (userAgent.startsWith("bun/")) return ["bun", ["install"]];
	return ["npm", ["install"]];
}

/** Downloads the latest scaffold template and upgrades the current project. */
export async function upgradeProject(root: string): Promise<void> {
	const temp = await mkdtemp(join(tmpdir(), "space-upgrade-"));
	try {
		await run("npm", ["pack", "create-spacefn@latest", "--pack-destination", temp], root);
		const archive = (await readdir(temp)).find((name) => name.endsWith(".tgz"));
		if (!archive) throw new Error("npm pack did not produce a create-spacefn archive");
		await run("tar", ["-xzf", join(temp, archive), "-C", temp], temp);

		const updated = await applyUpgradeTemplate(root, join(temp, "package", "template"));
		console.log("Updated docs/spacefn from the latest create-spacefn template.");
		if (updated.length === 0) {
			console.log("Framework dependency ranges are already current.");
			return;
		}

		console.log(`Updated dependencies: ${updated.join(", ")}`);
		const [command, args] = await installCommand(root);
		await run(command, args, root);
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}
