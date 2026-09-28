import { defineCommand } from "citty";
import { execa } from "execa";

export default defineCommand({
  meta: { name: "dev", description: "Start dev server" },
  args: {
    port: { type: "string", description: "Port number" },
  },
  async run({ args }) {
    const portFlag = args.port ? ["--port", args.port] : [];
    await execa("vite", ["dev", ...portFlag], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  },
});
