import { withSpan } from "./span";

export interface KVLike {
	get(...args: unknown[]): Promise<unknown>;
	getWithMetadata(...args: unknown[]): Promise<unknown>;
	put(...args: unknown[]): Promise<void>;
	delete(...args: unknown[]): Promise<void>;
	list(...args: unknown[]): Promise<unknown>;
}

/** Duck-types a KV namespace. */
export function isKV(value: unknown): value is KVLike {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as KVLike).getWithMetadata === "function" &&
		typeof (value as KVLike).put === "function" &&
		typeof (value as KVLike).list === "function"
	);
}

/**
 * Wraps a KV namespace so each operation becomes a `kv.*` span. Keys are not
 * recorded: they often carry user or session identifiers.
 */
export function traceKV(kv: KVLike): KVLike {
	const run = <T>(operation: string, fn: () => Promise<T>) =>
		withSpan(`kv.${operation}`, async () => fn(), {
			attributes: { "db.system": "kv", "db.operation.name": operation },
		});

	return {
		get: (...args) => run("get", () => kv.get(...args)),
		getWithMetadata: (...args) => run("get", () => kv.getWithMetadata(...args)),
		put: (...args) => run("put", () => kv.put(...args)),
		delete: (...args) => run("delete", () => kv.delete(...args)),
		list: (...args) => run("list", () => kv.list(...args)),
	};
}
