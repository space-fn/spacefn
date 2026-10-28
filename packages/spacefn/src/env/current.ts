import { AsyncLocalStorage } from "node:async_hooks";

import { SpaceError } from "../errors";

const store = new AsyncLocalStorage<object>();

/** Runs `fn` with `env` as the bindings for the work it starts: a request, a queue batch or a cron run. */
export function runWithBindings<T>(env: object, fn: () => T): T {
	return store.run(env, fn);
}

/** The bindings of the current request, queue batch or cron run. */
export function currentBindings(): Record<string, unknown> {
	const env = store.getStore();
	if (!env) {
		throw new SpaceError(
			"BINDINGS_MISSING",
			"No bindings are available here: use them while handling a request, message or cron run",
			{ hint: "Wrap the call in a request/queue/cron handler." },
		);
	}
	return env as Record<string, unknown>;
}
