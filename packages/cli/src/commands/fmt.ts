import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { defineCommand } from "citty";
import { execa } from "execa";

export default defineCommand({
  meta: { name: "fmt", description: "Format code with Biome" },
  args: {
    check: { type: "boolean", description: "Check only, don't write" },
  },
  async run({ args }) {
    const root = process.cwd();
    const config = resolve(root, "biome.json");

    if (!existsSync(config)) {
      // Use default config from this package
      const defaultConfig = new URL("../biome.json", import.meta.url).pathname;
      const flag = args.check ? "--write=false" : "--write";
      await execa("biome", ["format", flag, "--config-path", defaultConfig, "."], { stdio: "inherit" });
      return;
    }

    const flag = args.check ? "--write=false" : "--write";
    await execa("biome", ["format", flag, "--config-path", root, "."], { stdio: "inherit" });
  },
});
