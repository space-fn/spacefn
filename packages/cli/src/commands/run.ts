import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { defineCommand } from "citty";
import { log } from "../helpers/log.js";

function listScripts() {
  const scriptsDir = resolve(process.cwd(), "scripts");
  try {
    const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    if (files.length === 0) {
      log.warn("No scripts found in scripts/");
      return;
    }
    log.info("Available scripts:");
    files.forEach((f) => log.info(`  - ${f.replace(/\.(ts|js)$/, "")}`));
  } catch {
    log.warn("No scripts/ directory found. Create one to add custom scripts.");
  }
}

export default defineCommand({
  meta: { name: "run", description: "Run a custom script from scripts/" },
  args: {
    name: { type: "positional", description: "Script name" },
    list: { type: "boolean", description: "List available scripts", alias: "l" },
  },
  async run({ args }) {
    if (args.list || !args.name || args.name === "--list" || args.name === "-l") {
      listScripts();
      return;
    }

    const scriptsDir = resolve(process.cwd(), "scripts");
    const scriptPath = resolve(scriptsDir, `${args.name}.ts`);

    try {
      const script = await import(scriptPath);

      // If script exports a citty command (via defineCmd), run it
      if (script.default && typeof script.default === "object" && script.default.meta) {
        const { runMain } = await import("citty");
        await runMain(script.default);
        return;
      }

      // Otherwise, call default() or run()
      if (typeof script.default === "function") {
        await script.default();
      } else if (typeof script.run === "function") {
        await script.run();
      } else {
        log.error(`Script "${args.name}" has no default export or run function`);
        process.exit(1);
      }
    } catch (err: any) {
      if (err?.code === "ERR_MODULE_NOT_FOUND") {
        log.error(`Script "${args.name}" not found in scripts/`);
        listScripts();
      } else {
        throw err;
      }
    }
  },
});
