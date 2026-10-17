export type RouteEnv = "dev" | "prod";

export interface RoutePath {
	/** Hono path pattern, e.g. `/users/:id`. */
	path: string;
	/** Set when the file only builds in one environment (`x.dev.ts`). */
	env?: RouteEnv;
}

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const ENV_SUFFIX = /\.(dev|prod)$/;
const CATCH_ALL = /^\[\.\.\.(\w+)\]$/;
const DYNAMIC = /^\[(\w+)\]$/;
const GROUP = /^\(.+\)$/;

/**
 * Converts a file path relative to `routes/` into a Hono path.
 * Returns `null` for files that are not routes (any segment starting with `_`).
 */
export function parseRoutePath(file: string): RoutePath | null {
	const withoutExt = file.replace(EXTENSION, "");
	if (withoutExt === file) return null;

	const env = ENV_SUFFIX.exec(withoutExt)?.[1] as RouteEnv | undefined;
	const segments = withoutExt.replace(ENV_SUFFIX, "").split("/");

	if (segments.some((segment) => segment.startsWith("_"))) return null;

	const parts: string[] = [];
	for (const [i, segment] of segments.entries()) {
		if (GROUP.test(segment)) continue;
		if (segment === "index" && i === segments.length - 1) continue;

		const catchAll = CATCH_ALL.exec(segment)?.[1];
		const dynamic = DYNAMIC.exec(segment)?.[1];
		if (catchAll) parts.push(`:${catchAll}{.+}`);
		else if (dynamic) parts.push(`:${dynamic}`);
		else parts.push(segment);
	}

	const route: RoutePath = { path: `/${parts.join("/")}` };
	if (env) route.env = env;
	return route;
}
