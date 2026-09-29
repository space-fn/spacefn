import { existsSync } from "node:fs";
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";

import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";
import { resolve, join } from "pathe";
import pc from "picocolors";

// --- Constants ----------------------------------------------------------------

const TEMPLATE_DIR = join(import.meta.dirname, "template");

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

    // Scaffold
    const spinner = p.spinner();
    spinner.start("Creating project...");

    await mkdir(targetDir, { recursive: true });
    await writeTemplate(targetDir, projectName);

    spinner.stop("Project created!");

    // Done
    p.outro(`
${pc.green(`Created ${projectName}`)}

  cd ${projectName}
  pnpm install

${pc.dim("Docs: https://spacefn.dev")}
`);
  },
});

runMain(main);
