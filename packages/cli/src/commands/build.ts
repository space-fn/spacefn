import { defineCommand } from "citty";
import { execa } from "execa";

export default defineCommand({
  meta: { name: "build", description: "Build for production" },
  async run() {
    await execa("vite", ["build"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  },
});
