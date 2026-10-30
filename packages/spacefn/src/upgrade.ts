import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parseDocument } from "yaml";

type PackageJson = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	packageManager?: string;
	[key: string]: unknown;
};

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

function isPackageManager(value: string | undefined): value is PackageManager {
	return value === "pnpm" || value === "npm" || value === "yarn" || value === "bun";
}

async function detectPackageManager(root: string): Promise<PackageManager> {
	const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageJson;
	const declared = pkg.packageManager?.split("@", 1)[0];
	if (isPackageManager(declared)) return declared;

	const entries = new Set(await readdir(root));
	if (entries.has("pnpm-lock.yaml")) return "pnpm";
	if (entries.has("package-lock.json")) return "npm";
	if (entries.has("yarn.lock")) return "yarn";
	if (entries.has("bun.lock") || entries.has("bun.lockb")) return "bun";
	if (entries.has("pnpm-workspace.yaml")) return "pnpm";
	const userAgent = process.env.npm_config_user_agent ?? "";
	if (userAgent.startsWith("pnpm/")) return "pnpm";
	if (userAgent.startsWith("yarn/")) return "yarn";
	if (userAgent.startsWith("bun/")) return "bun";
	return "npm";
}

async function applyWorkerdOverride(
	root: string,
	pkg: PackageJson,
	manager: PackageManager,
	version: string,
): Promise<boolean> {
	if (manager === "pnpm") {
		const configPath = resolve(root, "pnpm-workspace.yaml");
		const source = await readFile(configPath, "utf8").catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return "";
			throw error;
		});
		const document = parseDocument(source);
		if (document.errors.length > 0) {
			throw new Error(`Could not parse pnpm-workspace.yaml: ${document.errors[0]?.message}`);
		}
		const config = document.toJS() as { overrides?: unknown } | null;
		const overrides = config?.overrides;
		if (
			overrides !== undefined &&
			(overrides === null || typeof overrides !== "object" || Array.isArray(overrides))
		) {
			throw new Error("pnpm-workspace.yaml overrides must be a mapping");
		}
		if ((overrides as Record<string, unknown> | undefined)?.workerd === version) return false;
		if (overrides === undefined) document.set("overrides", { workerd: version });
		else document.setIn(["overrides", "workerd"], version);
		await writeFile(configPath, document.toString());
		return true;
	}

	const key = manager === "yarn" ? "resolutions" : "overrides";
	const configured = pkg[key];
	if (
		configured !== undefined &&
		(configured === null || typeof configured !== "object" || Array.isArray(configured))
	) {
		throw new Error(`package.json ${key} must be an object`);
	}
	const rules = configured as Record<string, unknown> | undefined;
	if (rules?.workerd === version) return false;
	if (rules) rules.workerd = version;
	else pkg[key] = { workerd: version };
	return true;
}

/** Syncs framework dependencies and docs from a create-spacefn template. */
export async function applyUpgradeTemplate(
	root: string,
	template: string,
	workerdVersion?: string,
): Promise<string[]> {
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
	if (workerdVersion) {
		const manager = await detectPackageManager(root);
		if (await applyWorkerdOverride(root, pkg, manager, workerdVersion))
			updated.push("workerd override");
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

function runCapture(command: string, args: string[], cwd: string): Promise<string> {
	return new Promise((resolveOutput, reject) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
		let output = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			output += chunk;
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolveOutput(output);
			else reject(new Error(`${command} exited with code ${code ?? 1}`));
		});
	});
}

async function installCommand(root: string): Promise<[string, string[]]> {
	const manager = await detectPackageManager(root);
	return [manager, ["install"]];
}

/** Downloads the latest scaffold template and upgrades the current project. */
export async function upgradeProject(root: string): Promise<void> {
	const temp = await mkdtemp(join(tmpdir(), "space-upgrade-"));
	try {
		await run("npm", ["pack", "create-spacefn@latest", "--pack-destination", temp], root);
		const archive = (await readdir(temp)).find((name) => name.endsWith(".tgz"));
		if (!archive) throw new Error("npm pack did not produce a create-spacefn archive");
		await run("tar", ["-xzf", join(temp, archive), "-C", temp], temp);

		const workerdVersion = (
			await runCapture("npm", ["view", "workerd@latest", "version"], root)
		).trim();
		if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(workerdVersion)) {
			throw new Error(`npm returned an invalid workerd version: ${workerdVersion || "<empty>"}`);
		}
		const updated = await applyUpgradeTemplate(
			root,
			join(temp, "package", "template"),
			workerdVersion,
		);
		console.log("Updated docs/spacefn from the latest create-spacefn template.");
		if (updated.length === 0) {
			console.log("Framework dependencies and workerd override are already current.");
			return;
		}

		console.log(`Updated dependencies and overrides: ${updated.join(", ")}`);
		const [command, args] = await installCommand(root);
		await run(command, args, root);
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}
