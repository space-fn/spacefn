import { resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";

import { defineCommand } from "citty";
import { log } from "../../helpers/log.js";

export default defineCommand({
  meta: { name: "db:migrate", description: "Run pending database migrations" },
  args: {
    down: { type: "boolean", description: "Rollback last migration" },
    status: { type: "boolean", description: "Show migration status" },
  },
  async run({ args }) {
    const root = process.cwd();
    const migrationsDir = resolve(root, "src/db/migrations");

    if (!existsSync(migrationsDir)) {
      log.error("No migrations directory found at src/db/migrations/");
      log.info("Run `space db:generate` first to create migrations.");
      process.exit(1);
    }

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .sort();

    if (files.length === 0) {
      log.warn("No migration files found.");
      return;
    }

    log.info(`Found ${files.length} migration(s):`);
    files.forEach((f) => log.info(`  - ${f.replace(/\.(ts|js)$/, "")}`));
    log.warn("Configure your database connection in src/db/index.ts to run migrations.");
  },
});
