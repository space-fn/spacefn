import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { defineCommand } from "citty";
import { execa } from "execa";

export default defineCommand({
  meta: { name: "lint", description: "Lint code with Biome" },
  args: {
    fix: { type: "boolean", description: "Auto-fix issues" },
  },
  async run({ args }) {
    const root = process.cwd();
    const config = resolve(root, "biome.json");

    if (!existsSync(config)) {
      const defaultConfig = new URL("../biome.json", import.meta.url).pathname;
      const flag = args.fix ? "--write" : "--write=false";
      await execa("biome", [flag, "--config-path", defaultConfig, "."], { stdio: "inherit" });
      return;
    }

    const flag = args.fix ? "--write" : "--write=false";
    await execa("biome", [flag, "--config-path", root, "."], { stdio: "inherit" });
  },
});
