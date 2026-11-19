#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Option, Result, Stream } from "effect";
import { Command, Flag } from "effect/cli";
import { formatSpaceError, SpaceError } from "spacefn";
import { gen, loadPlan, watchGen, type PlannedDb, type WriteResult } from "spacefn/codegen";

import {
	connectFromEnv,
	dbMigrate,
	dbRollback,
	dbStatus,
	formatReport,
	isUnhealthy,
	type DbReport,
} from "./db.ts";
import { addDockerfile, APP_DOCKERFILE } from "./dockerfile.ts";

const summary = (result: WriteResult) => {
	const changes = [
		...result.written.map((file) => `  wrote   .space/${file}`),
		...result.removed.map((file) => `  removed .space/${file}`),
	];
	return changes.length === 0 ? "space gen: up to date" : ["space gen:", ...changes].join("\n");
};

const fail = (error: SpaceError) =>
	Console.error(formatSpaceError(error)).pipe(
		Effect.andThen(
			Effect.sync(() => {
				process.exitCode = 1;
			}),
		),
	);

const genCommand = Command.make(
	"gen",
	{
		watch: Flag.Boolean("watch").pipe(
			Flag.withAlias("w"),
			Flag.withDescription("Regenerate whenever app/ or configs/ change"),
			Flag.withDefault(false),
		),
		prod: Flag.Boolean("prod").pipe(
			Flag.withDescription("Include .prod.ts files instead of .dev.ts files"),
			Flag.withDefault(false),
		),
	},
	Effect.fn(function* ({ watch, prod }) {
		const root = process.cwd();
		const mode = prod ? "prod" : "dev";
		if (!watch)
			return yield* gen(root, mode).pipe(
				Effect.flatMap((result) => Console.log(summary(result))),
				Effect.catchTag("SpaceError", fail),
			);
		yield* watchGen(root, mode).pipe(
			Stream.runForEach((result) =>
				Result.isSuccess(result)
					? Console.log(summary(result.success))
					: Console.error(formatSpaceError(result.failure)),
			),
		);
	}),
).pipe(Command.withDescription("Generate .space/ from app/ and configs/space.ts"));

const exitWith = (message: string) =>
	Console.error(message).pipe(
		Effect.andThen(
			Effect.sync(() => {
				process.exitCode = 1;
			}),
		),
	);

const describeFailure = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const dbFlag = Flag.String("db").pipe(
	Flag.withDescription("Only this database (a folder name in app/db/)"),
	Flag.optional,
);

/** Runs a db command on the selected databases and prints what happened. */
const dbAction = (
	name: Option.Option<string>,
	run: (dbs: readonly PlannedDb[]) => Effect.Effect<readonly DbReport[], unknown>,
	options: { readonly single?: boolean } = {},
) =>
	Effect.gen(function* () {
		const plan = yield* loadPlan(process.cwd(), "dev");
		const dbs = Option.match(name, {
			onNone: () => plan.db,
			onSome: (n) => plan.db.filter((db) => db.name === n),
		});
		if (dbs.length === 0)
			return yield* exitWith(
				Option.match(name, {
					onNone: () => "No databases: add a folder in app/db/",
					onSome: (n) => `No database named ${n} in app/db/`,
				}),
			);
		if (options.single && dbs.length > 1)
			return yield* exitWith(
				`Choose one database with --db (${dbs.map((db) => db.name).join(", ")})`,
			);
		const reports = yield* run(dbs);
		yield* Console.log(reports.map(formatReport).join("\n"));
		if (reports.some(isUnhealthy)) process.exitCode = 1;
	}).pipe(
		Effect.catch((error) =>
			error instanceof SpaceError ? fail(error) : exitWith(`space db: ${describeFailure(error)}`),
		),
	);

const dbCommand = Command.make("db").pipe(
	Command.withDescription(
		"Migrate libSQL databases. D1 and Durable Object databases migrate when the app starts",
	),
	Command.withSubcommands([
		Command.make("status", { db: dbFlag }, ({ db }) =>
			dbAction(db, (dbs) => dbStatus(dbs, connectFromEnv)),
		).pipe(Command.withDescription("Compare migration files with each database's ledger")),
		Command.make("migrate", { db: dbFlag }, ({ db }) =>
			dbAction(db, (dbs) => dbMigrate(dbs, connectFromEnv)),
		).pipe(Command.withDescription("Apply pending migrations")),
		Command.make(
			"rollback",
			{
				db: dbFlag,
				steps: Flag.Int("steps").pipe(
					Flag.withDescription("How many migrations to undo, newest first"),
					Flag.withDefault(1),
				),
			},
			({ db, steps }) =>
				dbAction(db, (dbs) => dbRollback(dbs[0] as PlannedDb, steps, connectFromEnv), {
					single: true,
				}),
		).pipe(Command.withDescription("Undo the newest migrations with their down sections")),
	]),
);

const addCommand = Command.make("add").pipe(
	Command.withDescription("Add an optional file to the app"),
	Command.withSubcommands([
		Command.make("docker", {}, () =>
			Effect.promise(() => addDockerfile(process.cwd())).pipe(
				Effect.flatMap((result) =>
					result === "written"
						? Console.log(`space add docker: wrote ${APP_DOCKERFILE}`)
						: exitWith(`space add docker: ${APP_DOCKERFILE} already exists`),
				),
			),
		).pipe(Command.withDescription(`Copy spacefn's Dockerfile to ${APP_DOCKERFILE} to change it`)),
	]),
);

Command.make("space").pipe(
	Command.withDescription("spacefn: folder-convention apps on Effect"),
	Command.withSubcommands([genCommand, dbCommand, addCommand]),
	Command.run({ version: "0.11.0-alpha.0" }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain,
);
