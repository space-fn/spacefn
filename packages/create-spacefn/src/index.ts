import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";

import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";
import { resolve, join } from "pathe";
import pc from "picocolors";

// --- Constants ----------------------------------------------------------------

const TEMPLATE_DIR = join(import.meta.dirname, "template");

// --- Package Manager ----------------------------------------------------------

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

const PKG_MANAGERS: { value: PackageManager; label: string; install: string; addDev: string }[] = [
  { value: "pnpm", label: "pnpm", install: "pnpm add", addDev: "pnpm add -D" },
  { value: "npm", label: "npm", install: "npm i", addDev: "npm i -D" },
  { value: "yarn", label: "yarn", install: "yarn add", addDev: "yarn add -D" },
  { value: "bun", label: "bun", install: "bun add", addDev: "bun add -d" },
];

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

function install(targetDir: string, pm: PackageManager): void {
  const mgr = PKG_MANAGERS.find((m) => m.value === pm)!;

  const allDeps = [
    "@spacefn/asteroids",
    "@spacefn/cli",
    "hono",
    "@biomejs/biome",
    "@cloudflare/vite-plugin",
    "@cloudflare/workers-types",
    "@types/node",
    "typescript",
    "vite",
    "vitest",
    "wrangler",
  ];

  // pnpm 12.5+ blocks build scripts by default; use --allow-build to approve them
  const allowBuild = pm === "pnpm"
    ? "--allow-build='@cloudflare/vite-plugin' --allow-build='wrangler'"
    : "";
  execSync(`${mgr.addDev} ${allDeps.join(" ")} ${allowBuild}`, { cwd: targetDir, stdio: "inherit" });
}

// --- CLI ----------------------------------------------------------------------

const main = defineCommand({
  meta: {
    name: "create-spacefn",
    version: "0.2.0",
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

    // Package manager
    const pmResult = await p.select({
      message: "Package manager?",
      options: PKG_MANAGERS.map((m) => ({ value: m.value, label: m.label })),
      initialValue: "pnpm",
    });
    if (p.isCancel(pmResult)) {
      p.cancel("Aborted.");
      process.exit(0);
    }
    const pm = pmResult as PackageManager;

    // Scaffold
    const spinner = p.spinner();
    spinner.start("Creating project...");

    await mkdir(targetDir, { recursive: true });
    await writeTemplate(targetDir, projectName);

    spinner.message("Installing dependencies...");
    install(targetDir, pm);

    spinner.stop("Project created!");

    // Done
    p.outro(`
${pc.green(`Created ${projectName}`)}

  cd ${projectName}
  ${pm} dev

${pc.dim("Docs: https://spacefn.dev")}
`);
  },
});

runMain(main);
