import { defineCommand } from "citty";
import { execa } from "execa";

export default defineCommand({
  meta: { name: "test", description: "Run tests with Vitest" },
  args: {
    file: { type: "string", description: "Specific test file to run" },
    watch: { type: "boolean", description: "Run in watch mode", alias: "w" },
    coverage: { type: "boolean", description: "Run with coverage" },
  },
  async run({ args }) {
    const vitestArgs: string[] = [];

    if (args.watch) vitestArgs.push("--watch");
    if (args.coverage) vitestArgs.push("--coverage");
    if (args.file) vitestArgs.push(args.file);

    await execa("vitest", ["run", ...vitestArgs], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  },
});
