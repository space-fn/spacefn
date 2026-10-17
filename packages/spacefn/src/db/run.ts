import { withSpan } from "../trace/span";
import { applyMigrations, type Migration, type MigrationExecutor } from "./migrate";

/** Applies pending migrations inside a `db.migrate` span. Returns the ids applied. */
export function runMigrations(db: MigrationExecutor, migrations: Migration[]): Promise<string[]> {
	return withSpan(
		"db.migrate",
		async (span) => {
			span.setAttributes({ "db.migrations.total": migrations.length });
			const applied = await applyMigrations(db, migrations);
			span.setAttributes({ "db.migrations.applied": applied.length });
			return applied;
		},
		{ attributes: { "db.system": "sqlite" } },
	);
}
