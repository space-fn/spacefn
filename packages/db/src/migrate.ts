import type { Kysely } from "kysely";
import { sql } from "kysely";

export interface Migration {
	name: string;
	up: (db: Kysely<any>) => Promise<void>;
	down: (db: Kysely<any>) => Promise<void>;
}

async function ensureMigrationsTable(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable("_migrations")
		.ifNotExists()
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("name", "text", (col) => col.notNull().unique())
		.addColumn("applied_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();
}

async function getAppliedMigrations(db: Kysely<any>): Promise<string[]> {
	const rows = await db.selectFrom("_migrations").select("name").execute();
	return rows.map((r: any) => r.name);
}

export async function migrate(db: Kysely<any>, migrations: Migration[]): Promise<void> {
	await ensureMigrationsTable(db);
	const applied = await getAppliedMigrations(db);
	const pending = migrations.filter((m) => !applied.includes(m.name));

	for (const migration of pending) {
		console.log(`[db] Running migration: ${migration.name}`);
		await migration.up(db);
		await db.insertInto("_migrations").values({ name: migration.name }).execute();
	}
}

export async function migrateDown(
	db: Kysely<any>,
	migrations: Migration[],
	steps: number = 1,
): Promise<void> {
	await ensureMigrationsTable(db);
	const applied = await getAppliedMigrations(db);
	const toRollback = applied
		.filter((name) => migrations.some((m) => m.name === name))
		.slice(-steps)
		.reverse();

	for (const name of toRollback) {
		const migration = migrations.find((m) => m.name === name);
		if (migration) {
			console.log(`[db] Rolling back migration: ${name}`);
			await migration.down(db);
			await db.deleteFrom("_migrations").where("name", "=", name).execute();
		}
	}
}

export async function migrateStatus(
	db: Kysely<any>,
	migrations: Migration[],
): Promise<{ applied: string[]; pending: string[] }> {
	await ensureMigrationsTable(db);
	const applied = await getAppliedMigrations(db);
	const pending = migrations.map((m) => m.name).filter((name) => !applied.includes(name));
	return { applied, pending };
}
