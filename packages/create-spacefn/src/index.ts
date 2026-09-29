import { existsSync } from "node:fs";
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";

import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";
import { resolve, join } from "pathe";
import pc from "picocolors";

// --- Constants ----------------------------------------------------------------

const TEMPLATE_DIR = join(import.meta.dirname, "template");
const REGISTRY_LATEST = "https://registry.npmjs.org";

// --- Package manager ----------------------------------------------------------

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

function detectPackageManager(): PackageManager {
	const agent = process.env.npm_config_user_agent ?? "";
	if (agent.startsWith("pnpm")) return "pnpm";
	if (agent.startsWith("yarn")) return "yarn";
	if (agent.startsWith("bun")) return "bun";
	return "npm";
}

// --- Helpers ------------------------------------------------------------------

async function writeTemplate(targetDir: string, projectName: string): Promise<void> {
	await cp(TEMPLATE_DIR, targetDir, { recursive: true });

	// Replace {{app_name}} placeholder in template files
	const files = ["package.json", "wrangler.jsonc"];
	for (const file of files) {
		const filePath = join(targetDir, file);
		if (existsSync(filePath)) {
			const content = await readFile(filePath, "utf-8");
			await writeFile(filePath, content.replaceAll("{{app_name}}", projectName), "utf-8");
		}
	}
}

async function fetchLatestVersion(name: string): Promise<string | null> {
	try {
		const res = await fetch(`${REGISTRY_LATEST}/${name.replace("/", "%2f")}/latest`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		const manifest = (await res.json()) as { version?: string };
		return typeof manifest.version === "string" ? manifest.version : null;
	} catch {
		return null;
	}
}

/**
 * Pin every dependency in the generated package.json to the latest version
 * published on the npm registry. Returns the names that could not be resolved;
 * those keep the fallback range from the template.
 */
async function pinLatestVersions(packageJsonPath: string): Promise<string[]> {
	const pkg = JSON.parse(await readFile(packageJsonPath, "utf-8")) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const sections = [pkg.dependencies, pkg.devDependencies];
	const names = [...new Set(sections.flatMap((section) => Object.keys(section ?? {})))];
	const unresolved: string[] = [];

	await Promise.all(
		names.map(async (name) => {
			const version = await fetchLatestVersion(name);
			if (version === null) {
				unresolved.push(name);
				return;
			}
			for (const section of sections) {
				if (section && name in section) section[name] = version;
			}
		}),
	);

	await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
	return unresolved;
}

// --- CLI ----------------------------------------------------------------------

const main = defineCommand({
	meta: {
		name: "create-spacefn",
		version: "0.2.5",
		description: "Scaffold a new SpaceFn project",
	},
	args: {
		name: { type: "positional", description: "Project name" },
	},
	async run({ args }) {
		p.intro(pc.bgCyan(pc.black(" create-spacefn ")));

		// Project name
		let projectName = args.name;
		if (!projectName) {
			const result = await p.text({
				message: "Project name?",
				placeholder: "my-app",
				validate: (v) => (v && v.length > 0 ? undefined : "Name is required"),
			});
			if (p.isCancel(result)) {
				p.cancel("Aborted.");
				process.exit(0);
			}
			projectName = result || "my-app";
		}

		const targetDir = resolve(process.cwd(), projectName);

		if (existsSync(targetDir)) {
			p.log.error(`Directory ${projectName} already exists.`);
			process.exit(1);
		}

		const pm = detectPackageManager();

		// Scaffold
		const spinner = p.spinner();
		spinner.start("Creating project...");

		await mkdir(targetDir, { recursive: true });
		await writeTemplate(targetDir, projectName);

		spinner.message("Resolving latest package versions...");
		const unresolved = await pinLatestVersions(join(targetDir, "package.json"));

		spinner.stop("Project created!");

		if (unresolved.length > 0) {
			p.log.warn(
				`Could not resolve latest versions for ${unresolved.join(", ")} - kept template versions.`,
			);
		}

		// Done
		p.outro(`
${pc.green(`Created ${projectName}`)}

  cd ${projectName}
  ${pm} install

${pc.dim("Docs: https://spacefn.dev")}
`);
	},
});

runMain(main);
