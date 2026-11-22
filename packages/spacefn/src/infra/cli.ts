#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Fiber, Option, Result, Stream } from "effect";
import { Command, Flag } from "effect/cli";
import { formatSpaceError, SpaceError } from "spacefn";
import {
	gen,
	genPlan,
	loadPlan,
	watchGen,
	type PlannedDb,
	type WriteResult,
} from "spacefn/internal/codegen";

import { checkDevPort, runAlchemy } from "./alchemy.ts";
import { build } from "./build.ts";
import { clean, KEPT } from "./clean.ts";
import {
	connectFor,
	dbMigrate,
	dbRollback,
	dbStatus,
	formatReport,
	isUnhealthy,
	type Connect,
	type DbReport,
} from "./db.ts";
import { devBun } from "./dev.ts";
import { docsMismatch, installDocs, loadDocs, spacefnVersion } from "./docs.ts";
import { doctor, formatChecks } from "./doctor.ts";
import { detectPackageManager } from "./package-manager.ts";
import { run } from "./process.ts";
import { installedSpacefn, providerUpgrades, readPackageJson, spacefnUpgrades } from "./upgrade.ts";
import { loadTarget } from "./vite-config.ts";

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
		const target = yield* loadTarget(root).pipe(Effect.catchTag("SpaceError", fail));
		if (target === undefined) return;
		if (!watch)
			return yield* gen(root, mode, target).pipe(
				Effect.flatMap((result) => Console.log(summary(result))),
				Effect.catchTag("SpaceError", fail),
			);
		yield* watchGen(root, mode, target).pipe(
			Stream.runForEach((result) =>
				Result.isSuccess(result)
					? Console.log(summary(result.success))
					: Console.error(formatSpaceError(result.failure)),
			),
		);
	}),
).pipe(Command.withDescription("Generate .space/ from app/, with the target in configs/vite.ts"));

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
	run: (dbs: readonly PlannedDb[], connect: Connect) => Effect.Effect<readonly DbReport[], unknown>,
	options: { readonly single?: boolean } = {},
) =>
	Effect.gen(function* () {
		const root = process.cwd();
		loadDotEnv(root);
		const plan = yield* loadPlan(root, "dev", yield* loadTarget(root));
		const dbs = Option.match(name, {
			// A `manual` database has no one URL to migrate; --db names one for DB_<NAME>_URL.
			onNone: () => plan.db.filter((db) => db.open !== "manual"),
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
		const reports = yield* run(dbs, connectFor(plan.target, root));
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
			dbAction(db, (dbs, connect) => dbStatus(dbs, connect)),
		).pipe(Command.withDescription("Compare migration files with each database's ledger")),
		Command.make("migrate", { db: dbFlag }, ({ db }) =>
			dbAction(db, (dbs, connect) => dbMigrate(dbs, connect)),
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
				dbAction(db, (dbs, connect) => dbRollback(dbs[0] as PlannedDb, steps, connect), {
					single: true,
				}),
		).pipe(Command.withDescription("Undo the newest migrations with their down sections")),
	]),
);

/** Loads `<root>/.env` into the environment, as Bun and Alchemy do for the app. */
const loadDotEnv = (root: string) => {
	const file = join(root, ".env");
	if (existsSync(file)) process.loadEnvFile(file);
};

/** Ends with the exit code of a tool the CLI ran. */
const exitCode = (code: number) =>
	Effect.sync(() => {
		if (code !== 0) process.exitCode = code;
	});

const stageFlag = Flag.String("stage").pipe(
	Flag.withDescription("Deployment stage, e.g. prod or staging. Default: prod (dev: yours)"),
	Flag.optional,
);
const yesFlag = Flag.Boolean("yes").pipe(
	Flag.withAlias("y"),
	Flag.withDescription("Don't ask for approval (for CI)"),
	Flag.withDefault(false),
);

/** `gen`, printed, failing the command readably. */
const generate = (root: string, mode: "dev" | "prod") =>
	Effect.gen(function* () {
		const { plan, result } = yield* genPlan(root, mode, yield* loadTarget(root));
		if (result.written.length + result.removed.length > 0) yield* Console.log(summary(result));
		return plan;
	});

/** Ends a command on its error: a SpaceError formatted, anything else by its message. */
const report = (error: unknown) =>
	error instanceof SpaceError ? fail(error) : exitWith(`space: ${describeFailure(error)}`);

const devCommand = Command.make(
	"dev",
	{
		port: Flag.Int("port").pipe(
			Flag.withAlias("p"),
			Flag.withDescription(
				"Port for the dev server, which must be free. Default: 1337 on Cloudflare, Vite's on Bun",
			),
			Flag.optional,
		),
		stage: stageFlag,
	},
	({ port, stage }) =>
		Effect.gen(function* () {
			const root = process.cwd();
			const plan = yield* generate(root, "dev");
			const asked = Option.getOrUndefined(port);
			if (plan.target === "cloudflare") yield* checkDevPort(root, asked);
			// Keep .space/ current while the dev server runs; Vite and Alchemy reload from it.
			const watcher = yield* Effect.forkChild(
				watchGen(root, "dev", plan.target).pipe(
					Stream.drop(1),
					Stream.runForEach((result) =>
						Result.isSuccess(result)
							? result.success.written.length + result.success.removed.length > 0
								? Console.log(summary(result.success))
								: Effect.void
							: Console.error(formatSpaceError(result.failure)),
					),
				),
			);
			const code = yield* plan.target === "cloudflare"
				? runAlchemy(root, "dev", { stage: Option.getOrUndefined(stage), port: asked })
				: devBun(root, asked);
			yield* Fiber.interrupt(watcher);
			yield* exitCode(code);
		}).pipe(Effect.catch(report)),
).pipe(
	Command.withDescription(
		"Run the app locally: workerd via Alchemy on Cloudflare, Vite inside Bun on Bun",
	),
);

const buildCommand = Command.make("build", {}, () =>
	Effect.gen(function* () {
		const root = process.cwd();
		const target = yield* loadTarget(root);
		// Alchemy builds the Worker with Cloudflare's Vite plugin, which only it adds.
		if (target === "cloudflare")
			return yield* Console.log("space build: the Worker is built and uploaded by space deploy");
		yield* build(root);
		yield* Console.log("space build: wrote dist/ (run it with bun dist/server/index.js)");
	}).pipe(Effect.catch(report)),
).pipe(Command.withDescription("vite build with configs/vite.ts, into dist/ (Bun)"));

const deployCommand = Command.make("deploy", { stage: stageFlag, yes: yesFlag }, ({ stage, yes }) =>
	Effect.gen(function* () {
		const root = process.cwd();
		// configs/infra.ts reads .space/infra.ts; the build happens in the stack (Vite, or the Dockerfile).
		yield* generate(root, "prod");
		yield* exitCode(
			yield* runAlchemy(root, "deploy", { stage: Option.getOrUndefined(stage), yes }),
		);
	}).pipe(Effect.catch(report)),
).pipe(
	Command.withDescription(
		"alchemy deploy configs/infra.ts. Variables come from .env.<stage> and the environment",
	),
);

const destroyCommand = Command.make(
	"destroy",
	{ stage: stageFlag, yes: yesFlag },
	({ stage, yes }) =>
		Effect.gen(function* () {
			const root = process.cwd();
			yield* generate(root, "prod");
			yield* exitCode(
				yield* runAlchemy(root, "destroy", { stage: Option.getOrUndefined(stage), yes }),
			);
		}).pipe(Effect.catch(report)),
).pipe(
	Command.withDescription(
		"alchemy destroy configs/infra.ts: delete everything a stage deployed, its data included",
	),
);

const doctorCommand = Command.make("doctor", {}, () =>
	Effect.gen(function* () {
		const checks = yield* Effect.promise(() => doctor(process.cwd()));
		yield* Console.log(formatChecks(checks));
		if (checks.some((check) => check.level === "fail")) process.exitCode = 1;
	}),
).pipe(Command.withDescription("Check what dev and deploy need"));

const upgradeCommand = Command.make("upgrade", {}, () =>
	Effect.gen(function* () {
		const root = process.cwd();
		const manager = detectPackageManager(root);
		const runAll = (commands: readonly (readonly string[])[]) =>
			Effect.gen(function* () {
				for (const [command, ...args] of commands) {
					yield* Console.log(`$ ${[command, ...args].join(" ")}`);
					const code = yield* run(command!, args, { cwd: root });
					if (code !== 0) return code;
				}
				return 0;
			});
		const app = yield* Effect.promise(() => readPackageJson(root));
		const commands = spacefnUpgrades(manager, app);
		if (commands.length === 0)
			return yield* exitWith("space upgrade: spacefn isn't in package.json");
		if ((yield* runAll(commands)) !== 0) return yield* exitCode(1);
		const spacefn = yield* Effect.promise(() => installedSpacefn(root));
		if (spacefn && (yield* runAll(providerUpgrades(manager, app, spacefn))) !== 0)
			return yield* exitCode(1);
		yield* generate(root, "dev");
		yield* Console.log("space upgrade: done");
	}).pipe(Effect.catch(report)),
).pipe(Command.withDescription("Update spacefn, its Alchemy provider and docs, then .space/"));

const docsCommand = Command.make(
	"docs",
	{
		port: Flag.Int("port").pipe(
			Flag.withAlias("p"),
			Flag.withDescription("Port for the docs server"),
			Flag.withDefault(4321),
		),
	},
	({ port }) =>
		Effect.gen(function* () {
			const root = process.cwd();
			const docs = yield* Effect.promise(() => loadDocs(root));
			if (!docs)
				return yield* exitWith(
					`space docs: the docs come with spacefn-docs; add it: ${installDocs(root)}`,
				);
			const mismatch = docsMismatch(docs);
			if (mismatch) yield* Console.error(`space docs: ${mismatch}`);
			yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: () => docs.serve({ root, port }),
					catch: (error) =>
						new Error(`can't serve the docs on port ${port}: ${describeFailure(error)}`),
				}),
				(server) => Effect.promise(() => server.close()),
			).pipe(
				Effect.tap((server) =>
					Console.log(
						`space docs: ${server.url} (your docs/ and spacefn's; pages reload as you edit)`,
					),
				),
				Effect.andThen(Effect.never),
				Effect.scoped,
			);
		}).pipe(Effect.catch(report)),
).pipe(Command.withDescription("Read your docs/ and spacefn's docs in the browser"));

const cleanCommand = Command.make("clean", {}, () =>
	Effect.gen(function* () {
		const removed = yield* Effect.promise(() => clean(process.cwd()));
		yield* Console.log(
			removed.length === 0
				? "space clean: nothing to remove"
				: `space clean: removed ${removed.join(", ")}`,
		);
		yield* Console.log(`  kept ${KEPT.map((entry) => `.space/${entry}`).join(", ")} (local data)`);
	}),
).pipe(Command.withDescription("Delete generated files and builds in .space/"));

Command.make("space").pipe(
	Command.withDescription("spacefn: folder-convention apps on Effect"),
	Command.withSubcommands([
		devCommand,
		buildCommand,
		deployCommand,
		destroyCommand,
		genCommand,
		dbCommand,
		doctorCommand,
		upgradeCommand,
		docsCommand,
		cleanCommand,
	]),
	Command.run({ version: spacefnVersion() }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain,
);
