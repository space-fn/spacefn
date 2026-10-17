import { defineCommand } from "citty";
import { execa } from "execa";

import { resolveBiomeConfig } from "../helpers/biome.js";
import { log } from "../helpers/log.js";

export default defineCommand({
	meta: { name: "check", description: "Run all checks (fmt + lint + typecheck)" },
	async run() {
		let exitCode = 0;
		const config = resolveBiomeConfig(process.cwd());

		// Format check
		log.info("Running format check...");
		try {
			await execa("biome", ["format", "--config-path", config, "."], { stdio: "inherit" });
		} catch {
			exitCode = 1;
		}

		// Lint check
		log.info("Running lint...");
		try {
			await execa("biome", ["lint", "--config-path", config, "."], { stdio: "inherit" });
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
