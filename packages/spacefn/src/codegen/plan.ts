import type { AnalyzedQuery, Migration } from "@spacefn/sql";
import { Effect } from "effect";

import { SpaceError } from "../errors.ts";
import {
	DEFAULT_DB_DRIVER,
	type DbDriver,
	type ResolvedSpaceConfig,
	type Target,
} from "../space-config.ts";
import { bindingName, pascalName, unitName } from "./names.ts";
import {
	CODE_FILE,
	compareRoutePaths,
	isTestFile,
	parseRoutePath,
	type Mode,
	type RoutePath,
} from "./route-path.ts";
import type { AppTree } from "./scan-app.ts";

export interface PlannedRoute extends RoutePath {
	readonly kind: "route" | "page";
	/** Path from the app root, e.g. `app/routes/users/[id].ts`. */
	readonly file: string;
}

export interface PlannedUnit {
	readonly name: string;
	readonly file: string;
	/** Runtime binding, e.g. `QUEUE_EMAILS`. */
	readonly binding: string;
}

export interface PlannedClass extends PlannedUnit {
	/** Exported class name, e.g. `ChatRoom`. */
	readonly className: string;
}

export interface PlannedDb {
	readonly name: string;
	readonly driver: DbDriver;
	readonly binding: string;
	readonly migrations: readonly Migration[];
	readonly queries: readonly AnalyzedQuery[];
}

/** Everything codegen needs, checked. Rendering it cannot fail. */
export interface AppPlan {
	readonly target: Target;
	readonly name: string;
	readonly mode: Mode;
	readonly aliases: Readonly<Record<string, string>>;
	readonly env: boolean;
	readonly layers: boolean;
	/** Routes and pages together, most specific first. */
	readonly routes: readonly PlannedRoute[];
	/** Middleware files in run order (file name order, numbers compared as numbers). */
	readonly middleware: readonly string[];
	readonly queues: readonly PlannedUnit[];
	readonly crons: readonly Omit<PlannedUnit, "binding">[];
	readonly durableObjects: readonly PlannedClass[];
	readonly workflows: readonly PlannedClass[];
	/** Client entry files (scripts and stylesheets). */
	readonly client: readonly string[];
	readonly db: readonly PlannedDb[];
}

const fail = (code: string, message: string, hint: string, file?: string) =>
	Effect.fail(new SpaceError({ code, message, hint, ...(file ? { file } : {}) }));

/** Code files that are units: not private (`_x.ts`), not tests, not type declarations. */
const unitFiles = (files: readonly string[]) =>
	files.filter(
		(file) =>
			CODE_FILE.test(file) && !file.startsWith("_") && !file.endsWith(".d.ts") && !isTestFile(file),
	);

/** `/users/:id` and `/users/:userId` match the same requests. */
const shape = (path: string) => path.replace(/:[^/]+/g, ":");

const planRoutes = (tree: AppTree, mode: Mode) =>
	Effect.gen(function* () {
		const routes: PlannedRoute[] = [];
		const byShape = new Map<string, PlannedRoute>();
		for (const [kind, folder, files] of [
			["route", "routes", tree.routes],
			["page", "pages", tree.pages],
		] as const) {
			for (const file of files) {
				const parsed = yield* parseRoutePath(file).pipe(
					Effect.mapError(
						(error) =>
							new SpaceError({
								code: error.code,
								message: error.message,
								...(error.hint ? { hint: error.hint } : {}),
								file: `app/${folder}/${file}`,
							}),
					),
				);
				if (!parsed || (parsed.mode && parsed.mode !== mode)) continue;
				const route: PlannedRoute = { ...parsed, kind, file: `app/${folder}/${file}` };
				const existing = byShape.get(shape(route.path));
				if (existing)
					return yield* fail(
						"ROUTE_DUP",
						`${existing.file} and ${route.file} both serve ${route.path}`,
						"Rename or move one of them.",
						route.file,
					);
				byShape.set(shape(route.path), route);
				routes.push(route);
			}
		}
		return routes.sort(compareRoutePaths);
	});

const planUnits = (folder: string, files: readonly string[], prefix: string) =>
	Effect.forEach(unitFiles(files), (file) =>
		Effect.map(unitName(folder, file), (name) => ({
			name,
			file: `app/${folder}/${file}`,
			binding: bindingName(prefix, name),
		})),
	);

const planClasses = (folder: string, files: readonly string[], prefix: string) =>
	Effect.map(planUnits(folder, files, prefix), (units) =>
		units.map((unit) => ({ ...unit, className: pascalName(unit.name) })),
	);

const planClient = (files: readonly string[]) =>
	Effect.gen(function* () {
		const entries = files.filter(
			(file) =>
				(CODE_FILE.test(file) || file.endsWith(".css")) &&
				!file.startsWith("_") &&
				!file.endsWith(".d.ts") &&
				!isTestFile(file),
		);
		const seen = new Map<string, string>();
		for (const file of entries) {
			const base = file.replace(/\.[^.]+$/, "");
			const previous = seen.get(base);
			if (previous)
				return yield* fail(
					"CLIENT_DUP_ENTRY",
					`Entries ${previous} and ${file} share the name "${base}", so their bundles would collide`,
					"Rename one, or import the stylesheet from the script.",
					`app/client/${file}`,
				);
			seen.set(base, file);
		}
		return entries.map((file) => `app/client/${file}`);
	});

const CLOUDFLARE_ONLY_DRIVERS: ReadonlySet<DbDriver> = new Set(["d1", "durable-object"]);

const planDb = (tree: AppTree, config: ResolvedSpaceConfig) =>
	Effect.gen(function* () {
		const folders = new Set(tree.db.map((db) => db.name));
		for (const name of Object.keys(config.db))
			if (!folders.has(name))
				return yield* fail(
					"DB_UNKNOWN",
					`configs/space.ts sets a driver for "${name}", but there is no app/db/${name}/ folder`,
					`Create app/db/${name}/migrations/, or remove "${name}" from db.`,
					"configs/space.ts",
				);

		return yield* Effect.forEach(tree.db, (db) =>
			Effect.gen(function* () {
				const name = yield* unitName("db", db.name);
				const driver = config.db[name] ?? DEFAULT_DB_DRIVER[config.target];
				if (config.target !== "cloudflare" && CLOUDFLARE_ONLY_DRIVERS.has(driver))
					return yield* fail(
						"TARGET_UNSUPPORTED",
						`Database "${name}" uses the ${driver} driver, which only runs on Cloudflare`,
						`Use "libsql" for target "${config.target}".`,
						"configs/space.ts",
					);
				return {
					name,
					driver,
					binding: bindingName("DB", name),
					migrations: db.migrations,
					queries: db.queries,
				};
			}),
		);
	});

/** Generated files must be ignored, or Vite and Tailwind watch Alchemy's state and loop. */
const IGNORES_SPACE = /^\/?\.space\/?$/m;

const checkGitignore = (tree: AppTree) =>
	tree.gitignore !== undefined && IGNORES_SPACE.test(tree.gitignore)
		? Effect.void
		: fail(
				"GITIGNORE_SPACE",
				".space/ is not in .gitignore",
				"Add a line with .space/ to .gitignore. Generated files must not be committed or watched.",
				".gitignore",
			);

const checkTarget = (target: Target, folder: string, units: readonly PlannedUnit[]) => {
	const first = units[0];
	return target === "cloudflare" || first === undefined
		? Effect.void
		: fail(
				"TARGET_UNSUPPORTED",
				`app/${folder}/ only runs on Cloudflare, but the target is "${target}"`,
				`Remove app/${folder}/, or set target: "cloudflare" in configs/space.ts.`,
				first.file,
			);
};

/** Checks the scanned app against the config and works out everything codegen emits. */
export const planApp = (
	tree: AppTree,
	config: ResolvedSpaceConfig,
	mode: Mode,
): Effect.Effect<AppPlan, SpaceError> =>
	Effect.gen(function* () {
		yield* checkGitignore(tree);
		const durableObjects = yield* planClasses("durable-objects", tree.durableObjects, "DO");
		const workflows = yield* planClasses("workflows", tree.workflows, "WF");
		yield* checkTarget(config.target, "durable-objects", durableObjects);
		yield* checkTarget(config.target, "workflows", workflows);
		const crons = yield* planUnits("crons", tree.crons, "CRON");

		return {
			target: config.target,
			name: config.name,
			mode,
			aliases: config.aliases,
			env: tree.env,
			layers: tree.layers,
			routes: yield* planRoutes(tree, mode),
			middleware: unitFiles(tree.middleware).map((file) => `app/middleware/${file}`),
			queues: yield* planUnits("queues", tree.queues, "QUEUE"),
			crons: crons.map(({ name, file }) => ({ name, file })),
			durableObjects,
			workflows,
			client: yield* planClient(tree.client),
			db: yield* planDb(tree, config),
		};
	});
