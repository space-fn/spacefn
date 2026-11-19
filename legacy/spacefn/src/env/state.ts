import { AsyncLocalStorage } from "node:async_hooks";

import type { MiddlewareHandler } from "hono";

import { SpaceError } from "../errors";
import type { Schema } from "./fields";
import { parseEnv } from "./parse";

const cache = new WeakMap<object, Record<string, unknown>>();
const store = new AsyncLocalStorage<Record<string, unknown>>();

/** Parses `raw` once per env object and makes it readable through `env`. */
export function bindEnv(schema: Schema, raw: object): Record<string, unknown> {
	let parsed = cache.get(raw);
	if (!parsed) {
		parsed = parseEnv(schema, raw as Record<string, unknown>) as Record<string, unknown>;
		cache.set(raw, parsed);
	}
	return parsed;
}

function values(): Record<string, unknown> {
	const current = store.getStore();
	if (!current)
		throw new SpaceError(
			"ENV_NOT_READY",
			"env is not ready: it can only be read while handling a request",
			{ hint: "Read env inside a request handler." },
		);
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

/**
 * Runs `fn` with the validated env for the work it starts. Requests get this from
 * `envMiddleware`; queue batches and cron runs have no middleware, so the generated
 * worker wraps them with this.
 */
export function runWithEnv<T>(schema: Schema | undefined, raw: object, fn: () => T): T {
	if (!schema) return fn();
	return store.run(bindEnv(schema, raw), fn);
}

/** Validates the environment before each request reaches a handler. */
export function envMiddleware(schema: Schema): MiddlewareHandler {
	return async (c, next) => {
		const parsed = bindEnv(schema, c.env as object);
		await store.run(parsed, next);
	};
}
