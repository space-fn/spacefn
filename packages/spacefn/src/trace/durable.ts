import { withSpan } from "./span";

type Method = (...args: unknown[]) => unknown;
type Callable = Record<string, Method | undefined>;

/** Duck-types a Durable Object namespace binding. */
export function isDurableNamespace(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { idFromName?: unknown }).idFromName === "function" &&
		typeof (value as { get?: unknown }).get === "function"
	);
}

/**
 * Wraps a stub so each RPC method call becomes a `do.call` span. Arguments and
 * results are not recorded.
 */
function traceStub<T extends object>(stub: T, binding: string): T {
	return new Proxy(stub, {
		get(target, key) {
			const value: unknown = Reflect.get(target, key, target);
			if (typeof key !== "string" || typeof value !== "function") return value;
			return (...args: unknown[]) =>
				withSpan(
					"do.call",
					async (span) => {
						span.setAttributes({ "do.binding": binding, "rpc.method": key });
						// Called as a property, not via apply: RPC stubs reject apply.
						return (target as unknown as Callable)[key]?.(...args);
					},
					{ kind: "client" },
				);
		},
	});
}

/** Wraps a Durable Object namespace so every stub it hands out is traced. */
export function traceDurableNamespace<N extends object>(namespace: N, binding: string): N {
	return new Proxy(namespace, {
		get(target, key) {
			const value: unknown = Reflect.get(target, key, target);
			if (typeof value !== "function") return value;
			if (key !== "get" && key !== "getByName") return (value as Method).bind(target);
			return (...args: unknown[]) =>
				traceStub((target as unknown as Callable)[key]?.(...args) as object, binding);
		},
	});
}
