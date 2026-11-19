import { Effect } from "effect";

import { SpaceError } from "../errors.ts";

/** Which `space` mode a file is limited to, from a `.dev.ts` / `.prod.ts` suffix. */
export type Mode = "dev" | "prod";

export interface RoutePath {
	/** Path for Effect's `HttpRouter`: `/users/:id`, or `/files/*` for a catch-all. */
	readonly path: `/${string}`;
	/** Named parameters in order. A catch-all is listed last. */
	readonly params: readonly string[];
	/** The name of the catch-all parameter (`[...rest]` gives `rest`), read from the router's `*`. */
	readonly catchAll?: string;
	/** Set when the file only builds in one mode (`x.dev.ts`). */
	readonly mode?: Mode;
}

export const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const MODE_SUFFIX = /\.(dev|prod)$/;
// Identifiers only: the router treats `-` as a separator inside a segment.
const DYNAMIC = /^\[([A-Za-z_]\w*)\]$/;
const CATCH_ALL = /^\[\.\.\.([A-Za-z_]\w*)\]$/;
const GROUP = /^\(.+\)$/;

const badSegment = (file: string, segment: string, message: string, hint: string) =>
	new SpaceError({ code: "ROUTE_BAD_SEGMENT", message: `"${segment}": ${message}`, hint, file });

/** Test and spec files sit next to the code they test and are never routes or entries. */
export const isTestFile = (file: string): boolean => /\.(?:test|spec)\.[^/]*$/.test(file);

/**
 * Turns a file path relative to `routes/` or `pages/` into a router path.
 * Gives `null` for files that are not routes: non-code files, test files, and
 * anything under a segment starting with `_`.
 */
export const parseRoutePath = (file: string): Effect.Effect<RoutePath | null, SpaceError> =>
	Effect.gen(function* () {
		const bare = file.replace(CODE_FILE, "");
		if (bare === file || isTestFile(file)) return null;

		const mode = MODE_SUFFIX.exec(bare)?.[1] as Mode | undefined;
		const segments = bare.replace(MODE_SUFFIX, "").split("/");
		if (segments.some((segment) => segment.startsWith("_"))) return null;

		const parts: string[] = [];
		const params: string[] = [];
		let catchAll: string | undefined;
		for (const [i, segment] of segments.entries()) {
			const last = i === segments.length - 1;
			if (GROUP.test(segment)) continue;
			if (segment === "index" && last) continue;

			const rest = CATCH_ALL.exec(segment)?.[1];
			const param = DYNAMIC.exec(segment)?.[1];
			if (rest) {
				if (!last)
					return yield* badSegment(
						file,
						segment,
						"a catch-all must be the last segment",
						"Move [...name] to the file name, e.g. files/[...path].ts.",
					);
				parts.push("*");
				params.push(rest);
				catchAll = rest;
			} else if (param) {
				parts.push(`:${param}`);
				params.push(param);
			} else if (segment.includes("[") || segment.includes("]")) {
				return yield* badSegment(
					file,
					segment,
					"not a valid parameter",
					"Use [name] or [...name], where name is letters, digits and _ (e.g. [userId]).",
				);
			} else parts.push(segment);
		}

		return {
			path: `/${parts.join("/")}`,
			params,
			...(catchAll ? { catchAll } : {}),
			...(mode ? { mode } : {}),
		};
	});

const rank = (segment: string) => (segment === "*" ? 2 : segment.startsWith(":") ? 1 : 0);

/** Orders paths so the most specific wins: static, then `:param`, then `*`, per segment. */
export const compareRoutePaths = (a: { path: string }, b: { path: string }): number => {
	const left = a.path.split("/");
	const right = b.path.split("/");
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const l = left[i];
		const r = right[i];
		if (l === r) continue;
		if (l === undefined) return -1;
		if (r === undefined) return 1;
		return rank(l) - rank(r) || l.localeCompare(r);
	}
	return 0;
};
