import { defineActions, defineLoader } from "spacefn/pages";

import { addTodo, listTodos } from "../../.space/queries";
import { migrated } from "../db/migrate";

export const loader = defineLoader(async (c) => {
	await migrated(c.env.DB);
	return { todos: await listTodos(c.env.DB, {}) };
});

export const actions = defineActions({
	add: async (c) => {
		const form = await c.req.formData();
		const title = String(form.get("title") ?? "").trim();
		if (title === "") return c.json({ error: "bad_request", message: "Title is required" }, 400);
		await migrated(c.env.DB);
		await addTodo(c.env.DB, { title: title.slice(0, 200) });
		return undefined;
	},
});
