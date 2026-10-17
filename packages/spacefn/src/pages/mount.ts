import type { Context, Hono } from "hono";

import type { PageAction, PageRender, ServerModule } from "./define";

/** Registers a page: GET renders it, and POST runs the action named in `?_action=`. */
/**
 * The loader's data reaches the page unchecked. `definePage` and `defineLoader`
 * keep the two types in step within a page's own files.
 */
export function mountPage(
	app: Hono,
	path: string,
	page: PageRender<never>,
	server?: ServerModule,
): void {
	app.get(path, async (c: Context) => {
		const props = server?.loader ? await server.loader(c) : {};
		if (props instanceof Response) return props;
		return c.html(String(await page(props as never, c)));
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
			const result = await action(c);
			if (result instanceof Response) return result;
			return c.redirect(c.req.path, 303);
		});
	}
}
