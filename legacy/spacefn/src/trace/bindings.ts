import { isD1, traceD1 } from "./d1";
import { isDurableNamespace, traceDurableNamespace } from "./durable";
import { isKV, traceKV } from "./kv";
import { isQueue, traceQueue } from "./queue";

const tracedEnvs = new WeakMap<object, object>();
const tracedBindings = new WeakMap<object, unknown>();

function unwrapBinding(value: unknown): unknown {
	if (typeof value !== "object" || value === null) return value;
	const candidate = value as { binding?: unknown };
	if (candidate.binding && typeof candidate.binding === "object" && candidate.binding !== null) {
		const inner = candidate.binding as Record<string, unknown>;
		if (Object.keys(inner).length > 0) return inner;
	}
	return value;
}

function traceBinding(key: string | symbol, value: unknown): unknown {
	value = unwrapBinding(value);
	if (typeof value !== "object" || value === null) return value;
	let traced = tracedBindings.get(value);
	if (traced) return traced;

	if (isD1(value)) traced = traceD1(value);
	else if (isKV(value)) traced = traceKV(value);
	else if (isQueue(value)) traced = traceQueue(value);
	else if (isDurableNamespace(value)) traced = traceDurableNamespace(value, String(key));
	else return value;

	tracedBindings.set(value, traced);
	return traced;
}

/**
 * Returns the environment with every supported binding wrapped in tracing.
 * The same environment object always maps to the same result, so per-env
 * caching (see `envMiddleware`) keeps working.
 */
export function traceBindings<E extends object>(env: E): E {
	const cached = tracedEnvs.get(env);
	if (cached) return cached as E;

	const traced = new Proxy(env, {
		get: (target, key) => traceBinding(key, Reflect.get(target, key, target)),
	});
	tracedEnvs.set(env, traced);
	return traced;
}
