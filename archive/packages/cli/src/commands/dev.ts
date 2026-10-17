import { defineCommand } from "citty";
import { execa } from "execa";

import { resolveConfig } from "../helpers/config.js";

export default defineCommand({
	meta: { name: "dev", description: "Start dev server" },
	args: {
		port: { type: "string", description: "Port number" },
	},
	async run({ args }) {
		const portFlag = args.port ? ["--port", args.port] : [];
		const config = resolveConfig(process.cwd(), "vite");
		const configFlag = config ? ["--config", config] : [];
		await execa("vite", ["dev", ...portFlag, ...configFlag], {
			cwd: process.cwd(),
			stdio: "inherit",
		});
	},
});
