// Run by `space dev` under Bun, so the app's server code runs on Bun: `bun dev-bun.ts <root> [port]`.
import { join } from "node:path";

import { createServer } from "vite";

const [root = process.cwd(), port] = process.argv.slice(2);
const server = await createServer({
	configFile: join(root, "configs", "vite.ts"),
	root,
	server: port ? { port: Number(port), strictPort: true } : {},
});
await server.listen();
server.printUrls();
server.bindCLIShortcuts({ print: true });

const stop = () => void server.close().then(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
