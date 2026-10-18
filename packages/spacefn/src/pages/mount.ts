import type { Context, Hono } from "hono";

import type { PageAction, PageRender, ServerModule } from "./define";

/** Registers a page: GET renders it, and POST runs the action named in `?_action=`. */
/**
 * The loader's data reaches the page unchecked. `definePage` and `defineLoader`
 * keep the two types in step within a page's own files.
 */
export interface MountPageOptions {
	onError?: (error: unknown, c: Context) => Response | Promise<Response>;
}

export function mountPage(
	app: Hono,
	path: string,
	page: PageRender<never>,
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
			return c.html(String(await page(props as never, c)));
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
