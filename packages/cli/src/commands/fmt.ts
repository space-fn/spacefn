import { defineCommand } from "citty";
import { execa } from "execa";

import { resolveBiomeConfig } from "../helpers/biome.js";

export default defineCommand({
	meta: { name: "fmt", description: "Format code with Biome" },
	args: {
		check: { type: "boolean", description: "Check only, don't write" },
	},
	async run({ args }) {
		const config = resolveBiomeConfig(process.cwd());
		const writeFlag = args.check ? [] : ["--write"];
		await execa("biome", ["format", ...writeFlag, "--config-path", config, "."], {
			stdio: "inherit",
		});
	},
});
