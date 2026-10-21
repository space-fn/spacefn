import type { Context, Hono } from "hono";

import type { PageAction, PageRender, ServerModule } from "./define";
import { escapeHtml, Html, Raw } from "./html";

/**
 * Registers a page: GET renders it, and POST runs the action named in `?_action=`.
 * The loader's data reaches the page unchecked at run time. `definePage` and
 * `defineLoader` keep the two types in step within a page's own files.
 */
export interface MountPageOptions {
	onError?: (error: unknown, c: Context) => Response | Promise<Response>;
}

export function mountPage<P>(
	app: Hono,
	path: string,
	page: PageRender<P>,
	server?: ServerModule,
	options: MountPageOptions = {},
): void {
	const handleError = async (error: unknown, c: Context): Promise<Response> => {
		if (options.onError) return options.onError(error, c);
		console.error("[spacefn] page error", error);
		return c.json({ error: "internal_error", message: "Something went wrong" }, 500);
	};

	app.get(path, async (c: Context) => {
		try {
			const props = server?.loader ? await server.loader(c) : {};
			if (props instanceof Response) return props;
			const output = await page(props as P, c);
			// Pages are typed to return `Html` or `Raw`; escape anything a cast smuggles in.
			const markup =
				output instanceof Raw || output instanceof Html ? output.value : escapeHtml(String(output));
			return c.html(markup);
		} catch (error) {
			return handleError(error, c);
		}
	});

	if (server?.actions) {
		const actions = server.actions;
		app.post(path, async (c: Context) => {
			const name = c.req.query("_action");
			if (!name)
				return c.json({ error: "bad_request", message: "Name the action with ?_action=" }, 400);
			if (!Object.prototype.hasOwnProperty.call(actions, name)) {
				return c.json({ error: "not_found", message: `No action ${name}` }, 404);
			}
			const action = actions[name] as PageAction;
			try {
				const result = await action(c);
				if (result instanceof Response) return result;
				return c.redirect(c.req.path, 303);
			} catch (error) {
				return handleError(error, c);
			}
		});
	}
}
