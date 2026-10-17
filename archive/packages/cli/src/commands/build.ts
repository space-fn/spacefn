import { defineCommand } from "citty";
import { execa } from "execa";

import { resolveConfig } from "../helpers/config.js";

export default defineCommand({
	meta: { name: "build", description: "Build for production" },
	async run() {
		const config = resolveConfig(process.cwd(), "vite");
		const configFlag = config ? ["--config", config] : [];
		await execa("vite", ["build", ...configFlag], {
			cwd: process.cwd(),
			stdio: "inherit",
		});
	},
});
