import type { MiddlewareHandler } from "hono";

import type { Schema } from "./fields";
import { parseEnv } from "./parse";

const cache = new WeakMap<object, Record<string, unknown>>();
let current: Record<string, unknown> | undefined;

/** Parses `raw` once per env object and makes it readable through `env`. */
export function bindEnv(schema: Schema, raw: object): void {
	let parsed = cache.get(raw);
	if (!parsed) {
		parsed = parseEnv(schema, raw as Record<string, unknown>) as Record<string, unknown>;
		cache.set(raw, parsed);
	}
	current = parsed;
}

function values(): Record<string, unknown> {
	if (!current) throw new Error("env is not ready: it can only be read while handling a request");
	return current;
}

/** Untyped view of the validated environment. `spacefn/env` exposes it typed. */
export const envValues = new Proxy({} as Record<string, unknown>, {
	get: (_, key) => (typeof key === "string" ? values()[key] : undefined),
	has: (_, key) => typeof key === "string" && key in values(),
	ownKeys: () => Reflect.ownKeys(values()),
	getOwnPropertyDescriptor: (_, key) =>
		typeof key === "string" && key in values()
			? { enumerable: true, configurable: true, value: values()[key] }
			: undefined,
});

/** Validates the environment before each request reaches a handler. */
export function envMiddleware(schema: Schema): MiddlewareHandler {
	return async (c, next) => {
		bindEnv(schema, c.env as object);
		await next();
	};
}
