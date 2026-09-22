import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
// --- Create Space App ---------------------------------------------------------
// Scaffold a new Space project
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";

import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";
import { resolve, join } from "pathe";
import pc from "picocolors";

// --- Templates ----------------------------------------------------------------

const TEMPLATES = ["minimal"] as const;
type Template = (typeof TEMPLATES)[number];

const TEMPLATE_DIR = join(import.meta.dirname, "templates");

// --- Package Manager -----------------------------------------------------------

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

const PKG_MANAGERS: { value: PackageManager; label: string; install: string; addDev: string }[] = [
	{ value: "pnpm", label: "pnpm", install: "pnpm add", addDev: "pnpm add -D" },
	{ value: "npm", label: "npm", install: "npm i", addDev: "npm i -D" },
	{ value: "yarn", label: "yarn", install: "yarn add", addDev: "yarn add -D" },
	{ value: "bun", label: "bun", install: "bun add", addDev: "bun add -d" },
];

// --- Helpers ------------------------------------------------------------------

async function writeTemplate(
	targetDir: string,
	template: Template,
	projectName: string,
): Promise<void> {
	const srcDir = join(TEMPLATE_DIR, template);
	await cp(srcDir, targetDir, { recursive: true });

	// Set project name in package.json
	const pkgPath = join(targetDir, "package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
	pkg.name = projectName;
	await writeFile(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
}

function install(targetDir: string, pm: PackageManager, deps: string[], devDeps: string[]): void {
	const mgr = PKG_MANAGERS.find((m) => m.value === pm)!;
	if (deps.length > 0) {
		execSync(`${mgr.install} ${deps.join(" ")}`, { cwd: targetDir, stdio: "inherit" });
	}
	if (devDeps.length > 0) {
		execSync(`${mgr.addDev} ${devDeps.join(" ")}`, { cwd: targetDir, stdio: "inherit" });
	}
}

// --- CLI ----------------------------------------------------------------------

const main = defineCommand({
	meta: {
		name: "create-space-app",
		description: "Scaffold a new Space project",
		version: "0.1.0",
	},
	args: {
		name: {
			type: "positional",
			description: "Project name",
			required: false,
		},
	},
	async run({ args }) {
		p.intro(pc.bold(pc.cyan("Create Space App")));

		// Project name
		let projectName = args.name as string;
		if (!projectName) {
			const name = await p.text({
				message: "Project name?",
				placeholder: "my-space-app",
				validate(value) {
					if (!value) return "Project name is required";
					if (!/^[a-z0-9-_]+$/.test(value))
						return "Use lowercase, numbers, hyphens, or underscores";
				},
			});
			if (p.isCancel(name)) {
				p.cancel("Cancelled");
				process.exit(0);
			}
			projectName = name || "my-space-app";
		}

		// Package manager
		const pm = await p.select({
			message: "Package manager?",
			options: PKG_MANAGERS.map((m) => ({
				value: m.value,
				label: m.label,
			})),
			initialValue: "pnpm",
		});
		if (p.isCancel(pm)) {
			p.cancel("Cancelled");
			process.exit(0);
		}

		// Template
		const template = await p.select({
			message: "Template?",
			options: TEMPLATES.map((t) => ({
				value: t,
				label: t,
				hint: t === "minimal" ? "Basic routing and HTML" : undefined,
			})),
			initialValue: "minimal",
		});
		if (p.isCancel(template)) {
			p.cancel("Cancelled");
			process.exit(0);
		}

		// Target directory
		const targetDir = resolve(process.cwd(), projectName);
		if (existsSync(targetDir)) {
			p.cancel(`Directory ${projectName} already exists`);
			process.exit(1);
		}

		// Create project
		const s = p.spinner();
		s.start("Creating project...");
		await mkdir(targetDir, { recursive: true });
		await writeTemplate(targetDir, template as Template, projectName);
		s.stop("Project created");

		// Install dependencies
		const installDeps = await p.confirm({
			message: "Install dependencies?",
			initialValue: true,
		});
		if (p.isCancel(installDeps)) {
			p.cancel("Cancelled");
			process.exit(0);
		}

		if (installDeps) {
			const s2 = p.spinner();
			s2.start("Installing @space packages...");
			install(
				targetDir,
				pm as PackageManager,
				["@spacefn/html", "@spacefn/server", "@spacefn/datastar"],
				["wrangler"],
			);
			s2.stop("Dependencies installed");
		}

		// Done
		p.outro(pc.green("Done!"));
		p.note(`cd ${projectName}\n${pm} dev`, "Next steps");
	},
});

runMain(main);
