import { defineCommand } from "citty";
import { execa } from "execa";

import { resolveBiomeConfig } from "../helpers/biome.js";

export default defineCommand({
	meta: { name: "lint", description: "Lint code with Biome" },
	args: {
		fix: { type: "boolean", description: "Auto-fix issues" },
	},
	async run({ args }) {
		const config = resolveBiomeConfig(process.cwd());
		const writeFlag = args.fix ? ["--write"] : [];
		await execa("biome", ["lint", ...writeFlag, "--config-path", config, "."], {
			stdio: "inherit",
		});
	},
});
