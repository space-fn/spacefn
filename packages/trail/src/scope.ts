import type { Trail } from "./trail.js";

/** Resolves the trail an integration should report to. */
export type TrailResolver = () => Trail | undefined;

interface ScopeStore {
	trail: Trail;
}

interface AlsLike {
	getStore(): ScopeStore | undefined;
	run<T>(store: ScopeStore, fn: () => T): T;
}

interface AlsModuleLike {
	AsyncLocalStorage?: new () => AlsLike;
}

// Resolved once at runtime. Without a scope, `currentTrail()` returns
// undefined and instrumented integrations simply skip.
let als: AlsLike | undefined | null = null;

async function loadAls(): Promise<AlsLike | undefined> {
	if (als !== null) return als ?? undefined;
	// Static import cannot work here: these modules are platform-specific
	// (`cloudflare:workers` exists only on Workers, `node:async_hooks` only
	// with Node compat), so either static path would break the other runtime.
	const specifiers = ["cloudflare:workers", "node:async_hooks"];
	for (const specifier of specifiers) {
		try {
			const mod = (await import(/* @vite-ignore */ specifier)) as AlsModuleLike;
			if (mod?.AsyncLocalStorage) {
				als = new mod.AsyncLocalStorage();
				return als;
			}
		} catch {
			// Try the next backend.
		}
	}
	als = undefined;
	return undefined;
}

/**
 * Run `fn` with `trail` as the ambient trail. Instrumented integrations
 * (for example `trailDialect`) pick it up through `currentTrail()`.
 */
export async function runWithTrail<T>(trail: Trail, fn: () => T | Promise<T>): Promise<T> {
	const scope = await loadAls();
	if (!scope) return await fn();
	return scope.run({ trail }, fn);
}

/** The ambient trail of the current async context, if any. */
export function currentTrail(): Trail | undefined {
	return als?.getStore()?.trail;
}
