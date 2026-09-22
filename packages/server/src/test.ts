// --- Test Utilities -----------------------------------------------------------
// Helpers for testing routes and pages with vitest

import { createServer } from "./server.js";
import type { LoaderFn, ActionsConfig } from "./types.js";

/** Options for createTestHandler */
export interface TestPageOptions {
	/** Page loader function */
	loader?: LoaderFn;
	/** Page actions */
	actions?: ActionsConfig;
	/** Page component (returns HTML string) */
	page?: (props: unknown) => unknown;
}

/**
 * Create a test handler from a single page's loader, actions, and component.
 *
 * @example
 * ```ts
 * import { createTestHandler } from "@spacefn/server/test"
 * import { loader, actions } from "./index.server"
 * import Page from "./index.page"
 *
 * const handler = createTestHandler({ loader, actions, page: Page })
 *
 * it("renders page", async () => {
 *   const res = await handler(new Request("http://localhost/"))
 *   expect(await res.text()).toContain("Hello")
 * })
 *
 * it("handles action", async () => {
 *   const res = await handler(
 *     new Request("http://localhost/?_action=signup", {
 *       method: "POST",
 *       body: JSON.stringify({ email: "test@example.com" }),
 *       headers: { "Content-Type": "application/json" },
 *     })
 *   )
 *   expect(res.status).toBe(200)
 * })
 * ```
 */
export function createTestHandler(options: TestPageOptions) {
	return createServer({
		routes: [],
		pages: [
			{
				pattern: "/",
				...options,
			},
		],
	});
}
