// --- Page Functions -----------------------------------------------------------
// Functions for *.server.ts files: defineLoader, defineActions

import type { LoaderFn, ActionsConfig } from "./types.js";

/**
 * Define a page loader.
 *
 * @example
 * ```ts
 * // index.server.ts
 * export const loader = defineLoader(async (req) => {
 *   return { msg: "Hello World!" }
 * })
 * ```
 */
export function defineLoader<T>(fn: LoaderFn<T>): LoaderFn<T> {
	return fn;
}

/**
 * Define page actions for form submissions.
 *
 * @example
 * ```ts
 * // index.server.ts
 * export const actions = defineActions({
 *   signup: {
 *     input: z.object({ email: z.string().email() }),
 *     resolver: async (payload) => {
 *       // Handle signup
 *       return { success: true }
 *     }
 *   }
 * })
 * ```
 */
export function defineActions<T extends ActionsConfig>(config: T): T {
	return config;
}
