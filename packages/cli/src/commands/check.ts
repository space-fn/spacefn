import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { defineCommand } from "citty";
import { execa } from "execa";
import { log } from "../helpers/log.js";

export default defineCommand({
  meta: { name: "check", description: "Run all checks (fmt + lint + typecheck)" },
  async run() {
    let exitCode = 0;

    // Format check
    log.info("Running format check...");
    try {
      const root = process.cwd();
      const config = resolve(root, "biome.json");
      const configPath = existsSync(config) ? root : new URL("../../biome.json", import.meta.url).pathname;
      await execa("biome", ["format", "--write=false", "--config-path", configPath, "."], { stdio: "inherit" });
    } catch {
      exitCode = 1;
    }

    // Lint check
    log.info("Running lint...");
    try {
      const root = process.cwd();
      const config = resolve(root, "biome.json");
      const configPath = existsSync(config) ? root : new URL("../../biome.json", import.meta.url).pathname;
      await execa("biome", ["lint", "--write=false", "--config-path", configPath, "."], { stdio: "inherit" });
    } catch {
      exitCode = 1;
    }

    // Typecheck
    log.info("Running typecheck...");
    try {
      await execa("tsc", ["--noEmit"], { stdio: "inherit" });
    } catch {
      exitCode = 1;
    }

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  },
});
