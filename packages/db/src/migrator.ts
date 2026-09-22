// --- Migrator Helper ----------------------------------------------------------
// Wraps Kysely's Migrator for convenient usage

import type { Kysely, MigrationProvider, MigrationResultSet } from "kysely";

/** Migration definition */
export interface MigrationDefinition {
	/** Migration name */
	name: string;
	/** Run migration up */
	up: (sql: { exec: (query: string) => Promise<void> }) => Promise<void>;
	/** Run migration down */
	down: (sql: { exec: (query: string) => Promise<void> }) => Promise<void>;
}

/** Define a migration */
export function defineMigration(definition: MigrationDefinition): MigrationDefinition {
	return definition;
}

/** Migrator configuration */
export interface MigratorConfig {
	/** Kysely database instance */
	db: Kysely<unknown>;
	/** Kysely Migrator class */
	migrator: new (config: { db: Kysely<unknown>; provider: MigrationProvider }) => {
		migrateUp(): Promise<MigrationResultSet>;
		migrateDown(): Promise<MigrationResultSet>;
	};
	/** Array of migrations */
	migrations: MigrationDefinition[];
}

/**
 * Create a migrator function from Kysely migrations.
 *
 * @example
 * ```ts
 * // db/main/migrations/index.ts
 * import { Migrator } from "kysely/migration"
 * import { createMigrator } from "@spacefn/db"
 * import db from "../config"
 * import migration001 from "./001_create_users"
 *
 * export default createMigrator({
 *   db,
 *   migrator: Migrator,
 *   migrations: [migration001],
 * })
 *
 * // Usage
 * const migrate = createMigrator({ ... })
 * await migrate() // run up
 * await migrate({ direction: "down" }) // rollback
 * ```
 */
export function createMigrator(
	config: MigratorConfig,
): (options?: { direction?: "up" | "down" }) => Promise<MigrationResultSet> {
	const { db, migrator: MigratorClass, migrations } = config;

	return async (options?: { direction?: "up" | "down" }): Promise<MigrationResultSet> => {
		const direction = options?.direction ?? "up";

		// Convert our migrations to Kysely's format
		const provider: MigrationProvider = {
			async getMigrations() {
				const result: Record<
					string,
					{ up: (sql: unknown) => Promise<void>; down: (sql: unknown) => Promise<void> }
				> = {};
				for (const migration of migrations) {
					result[migration.name] = {
						up: migration.up as (sql: unknown) => Promise<void>,
						down: migration.down as (sql: unknown) => Promise<void>,
					};
				}
				return result;
			},
		};

		const migrator = new MigratorClass({ db, provider });

		if (direction === "down") {
			return migrator.migrateDown();
		}
		return migrator.migrateUp();
	};
}
