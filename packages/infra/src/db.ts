import { createClient } from "@libsql/client";
import { Config, Effect, Option, Redacted, type Scope } from "effect";
import type { PlannedDb } from "spacefn/codegen";
import {
	applyMigrations,
	libsqlConnection,
	migrationStatus,
	rollbackMigrations,
	type DbConnection,
	type MigrationStatus,
} from "spacefn/runtime";

/**
 * Opens a database for the CLI, or `undefined` when its driver is only
 * reachable inside the running app (D1 and Durable Object SQLite migrate when
 * the Worker starts).
 */
export type Connect = (
	db: PlannedDb,
) => Effect.Effect<DbConnection, unknown, Scope.Scope> | undefined;

/**
 * libSQL from `<BINDING>_URL` and `<BINDING>_AUTH_TOKEN`. The CLI runs on Node,
 * so it uses the full client, which also opens local `file:` databases.
 */
export const connectFromEnv: Connect = (db) => {
	if (db.driver !== "libsql") return undefined;
	return Effect.gen(function* () {
		const url = yield* Config.String(`${db.binding}_URL`).pipe(
			Effect.mapError(
				() =>
					new Error(
						`Set ${db.binding}_URL to the ${db.name} database's URL (libsql://, https:// or file:)`,
					),
			),
		);
		const token = yield* Config.Redacted(`${db.binding}_AUTH_TOKEN`).pipe(Config.option);
		const client = yield* Effect.acquireRelease(
			Effect.sync(() =>
				createClient({
					url,
					...Option.match(token, {
						onNone: () => ({}),
						onSome: (t) => ({ authToken: Redacted.value(t) }),
					}),
				}),
			),
			(c) => Effect.sync(() => c.close()),
		);
		return yield* libsqlConnection(client);
	});
};

export type DbReport =
	| { readonly db: string; readonly kind: "skipped"; readonly driver: string }
	| { readonly db: string; readonly kind: "status"; readonly status: MigrationStatus }
	| {
			readonly db: string;
			readonly kind: "applied" | "rolled-back";
			readonly ids: readonly string[];
	  };

const each = <A>(
	dbs: readonly PlannedDb[],
	connect: Connect,
	run: (connection: DbConnection, db: PlannedDb) => Effect.Effect<A, unknown>,
	report: (db: PlannedDb, result: A) => DbReport,
) =>
	Effect.forEach(dbs, (db) => {
		const open = connect(db);
		if (!open) return Effect.succeed<DbReport>({ db: db.name, kind: "skipped", driver: db.driver });
		return Effect.scoped(
			open.pipe(
				Effect.flatMap((connection) => run(connection, db)),
				Effect.map((result) => report(db, result)),
			),
		);
	});

export const dbStatus = (dbs: readonly PlannedDb[], connect: Connect) =>
	each(
		dbs,
		connect,
		(connection, db) => migrationStatus(connection, db.migrations),
		(db, status): DbReport => ({ db: db.name, kind: "status", status }),
	);

export const dbMigrate = (dbs: readonly PlannedDb[], connect: Connect) =>
	each(
		dbs,
		connect,
		(connection, db) => applyMigrations(connection, db.migrations),
		(db, ids): DbReport => ({ db: db.name, kind: "applied", ids }),
	);

export const dbRollback = (db: PlannedDb, steps: number, connect: Connect) =>
	each(
		[db],
		connect,
		(connection) => rollbackMigrations(connection, db.migrations, steps),
		(db, ids): DbReport => ({ db: db.name, kind: "rolled-back", ids }),
	);

/** Whether a status needs attention: an edited migration, or a ledger row with no file. */
export const isUnhealthy = (report: DbReport): boolean =>
	report.kind === "status" &&
	(report.status.unknown.length > 0 || report.status.migrations.some((m) => m.state === "changed"));

export const formatReport = (report: DbReport): string => {
	switch (report.kind) {
		case "skipped":
			return `${report.db} (${report.driver}): migrates when the app starts; nothing to do from the CLI`;
		case "applied":
		case "rolled-back": {
			const verb = report.kind === "applied" ? "applied" : "rolled back";
			if (report.ids.length === 0) return `${report.db}: up to date`;
			return [`${report.db}:`, ...report.ids.map((id) => `  ${verb} ${id}`)].join("\n");
		}
		case "status": {
			const lines = report.status.migrations.map(
				(m) =>
					`  ${m.state.padEnd(8)} ${m.id}${m.state === "changed" ? "  (edited after it was applied)" : ""}`,
			);
			for (const id of report.status.unknown)
				lines.push(`  ${"unknown".padEnd(8)} ${id}  (in the ledger, but no migration file)`);
			return [`${report.db}:`, ...(lines.length ? lines : ["  no migrations"])].join("\n");
		}
	}
};
