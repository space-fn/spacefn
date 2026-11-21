import { Effect } from "effect";

import { SpaceError } from "../errors.ts";
import { isValidSchedule } from "../jobs/cron.ts";
import {
	DEFAULT_DB_DRIVER,
	type DbDriver,
	type ResolvedSpaceConfig,
	type Target,
} from "../space-config.ts";
import type { AnalyzedQuery, Migration } from "../sql/index.ts";
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
	/** Path from the app root, e.g. `app/routes/users/[id].ts`. */
	readonly file: string;
}

export interface PlannedMiddleware {
	/** The folder it covers, e.g. `app/routes/admin`. */
	readonly folder: string;
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

export interface PlannedCron {
	readonly name: string;
	readonly file: string;
	/** Read from the `cron("...")` literal, since the infra must know it without running the file. */
	readonly schedule: string;
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
	readonly viteConfig: boolean;
	readonly infraConfig: boolean;
	/** Files in `app/routes/` (routes and pages), most specific first. */
	readonly routes: readonly PlannedRoute[];
	/** `_middleware.ts` files in `app/routes/`, outer folders first. */
	readonly middleware: readonly PlannedMiddleware[];
	readonly queues: readonly PlannedUnit[];
	readonly crons: readonly PlannedCron[];
	readonly durableObjects: readonly PlannedClass[];
	readonly workflows: readonly PlannedClass[];
	/** Whether the app imports `Kv` / `Blob`, so the infra creates them only when used. */
	readonly uses: { readonly kv: boolean; readonly blob: boolean };
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

const planRoutes = Effect.fnUntraced(function* (tree: AppTree, mode: Mode) {
	const routes: PlannedRoute[] = [];
	const byShape = new Map<string, PlannedRoute>();
	for (const file of tree.routes) {
		const parsed = yield* parseRoutePath(file).pipe(
			Effect.mapError(
				(error) =>
					new SpaceError({
						code: error.code,
						message: error.message,
						...(error.hint ? { hint: error.hint } : {}),
						file: `app/routes/${file}`,
					}),
			),
		);
		if (!parsed || (parsed.mode && parsed.mode !== mode)) continue;
		const route: PlannedRoute = { ...parsed, file: `app/routes/${file}` };
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
	return routes.sort(compareRoutePaths);
});

const MIDDLEWARE_FILE = /^_middleware\.(?:[cm]?[jt]s|[jt]sx)$/;

/** Every `_middleware.ts` in `app/routes/`, skipping private folders, outer folders first. */
const planMiddleware = (files: readonly string[]): PlannedMiddleware[] =>
	files
		.map((file) => ({ file, segments: file.split("/") }))
		.filter(
			({ segments }) =>
				MIDDLEWARE_FILE.test(segments.at(-1)!) &&
				!segments.slice(0, -1).some((segment) => segment.startsWith("_")),
		)
		.sort((a, b) => a.segments.length - b.segments.length || a.file.localeCompare(b.file))
		.map(({ file, segments }) => ({
			folder: ["app/routes", ...segments.slice(0, -1)].join("/"),
			file: `app/routes/${file}`,
		}));

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

const planClient = Effect.fnUntraced(function* (files: readonly string[]) {
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

/** Types a query file may name in `@column` / `@param`, with `?` for nullable. */
export const SQL_TYPE = /^(string|number|boolean|bytes|unknown)(\?)?$/;

const checkParamTypes = (db: AppTree["db"][number]) =>
	Effect.forEach(db.queries, (query) => {
		const bad = Object.entries(query.paramTypes).find(([, type]) => !SQL_TYPE.test(type));
		return bad
			? fail(
					"DB_PARAM_TYPE",
					`${query.name}: @param ${bad[0]} has unknown type "${bad[1]}"`,
					"Use string, number, boolean, bytes or unknown, with ? for nullable.",
					`app/db/${db.name}/queries`,
				)
			: Effect.void;
	});

const CLOUDFLARE_ONLY_DRIVERS: ReadonlySet<DbDriver> = new Set(["d1", "durable-object"]);

const planDb = Effect.fnUntraced(function* (tree: AppTree, config: ResolvedSpaceConfig) {
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
			yield* checkParamTypes(db);
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

const CRON_LITERAL = /\bcron\(\s*(["'`])([^"'`$]*)\1\s*,/;

/** Each cron with the schedule of its `cron("...", job)` call. */
const planCrons = Effect.fnUntraced(function* (tree: AppTree) {
	const crons: PlannedCron[] = [];
	for (const { name, file } of yield* planUnits("crons", tree.crons, "CRON")) {
		const source = tree.cronSources[file.slice("app/crons/".length)] ?? "";
		const literal = CRON_LITERAL.exec(source)?.[2];
		if (literal === undefined)
			return yield* fail(
				"CRON_SCHEDULE_LITERAL",
				"The schedule must be a string literal",
				'Write it in the file: export default cron("0 3 * * *", job). The infra reads it without running the file.',
				file,
			);
		const schedule = literal.trim().split(/\s+/).join(" ");
		if (!isValidSchedule(schedule))
			return yield* fail(
				"CRON_SCHEDULE",
				`"${schedule}" is not a five-field cron expression`,
				"Use minute hour day-of-month month day-of-week, e.g. 0 3 * * *",
				file,
			);
		crons.push({ name, file, schedule });
	}
	return crons;
});

/** Checks the scanned app against the config and works out everything codegen emits. */
export const planApp = Effect.fnUntraced(function* (
	tree: AppTree,
	config: ResolvedSpaceConfig,
	mode: Mode,
): Effect.fn.Return<AppPlan, SpaceError> {
	yield* checkGitignore(tree);
	const durableObjects = yield* planClasses("durable-objects", tree.durableObjects, "DO");
	const workflows = yield* planClasses("workflows", tree.workflows, "WF");
	yield* checkTarget(config.target, "durable-objects", durableObjects);
	yield* checkTarget(config.target, "workflows", workflows);

	return {
		target: config.target,
		name: config.name,
		mode,
		aliases: config.aliases,
		env: tree.env,
		layers: tree.layers,
		viteConfig: tree.viteConfig,
		infraConfig: tree.infraConfig,
		routes: yield* planRoutes(tree, mode),
		middleware: planMiddleware(tree.routes),
		queues: yield* planUnits("queues", tree.queues, "QUEUE"),
		crons: yield* planCrons(tree),
		durableObjects,
		workflows,
		uses: tree.uses,
		client: yield* planClient(tree.client),
		db: yield* planDb(tree, config),
	};
});
