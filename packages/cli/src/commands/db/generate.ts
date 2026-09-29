import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineCommand } from "citty";

import { log } from "../../helpers/log.js";
import { spinner } from "../../helpers/spinner.js";

export default defineCommand({
	meta: { name: "db:generate", description: "Generate database migration from schema" },
	args: {
		name: { type: "string", description: "Migration name (e.g. add_users_table)" },
	},
	async run({ args }) {
		const root = process.cwd();
		const schemaPath = resolve(root, "src/db/schema.ts");
		const migrationsDir = resolve(root, "src/db/migrations");

		if (!existsSync(schemaPath)) {
			log.error("No schema found at src/db/schema.ts");
			process.exit(1);
		}

		let db;
		try {
			db = await import("@spacefn/db");
		} catch {
			log.error("@spacefn/db is not installed. Run: pnpm add @spacefn/db");
			process.exit(1);
		}

		await spinner("Generating migration...", async () => {
			const schema = await import(schemaPath);
			const migrationName = args.name
				? db.generateMigrationName(args.name)
				: db.generateMigrationName("migration");

			const content = db.generateMigration(schema.default ?? schema, migrationName);

			if (!existsSync(migrationsDir)) {
				mkdirSync(migrationsDir, { recursive: true });
			}

			const migrationPath = resolve(migrationsDir, `${migrationName}.ts`);
			writeFileSync(migrationPath, content, "utf-8");

			log.success(`Migration created: src/db/migrations/${migrationName}.ts`);
		});
	},
});
