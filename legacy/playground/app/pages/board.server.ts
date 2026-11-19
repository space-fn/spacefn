import { addTodo, listTodos } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";
import { defineActions, defineLoader } from "spacefn/pages";

export const loader = defineLoader(async (c) => {
	await migrated(c.env.DB);
	return { todos: await listTodos(d1Executor(c.env.DB), {}) };
});

export const actions = defineActions({
	add: async (c) => {
		const form = await c.req.formData();
		const raw = form.get("title");
		const title = (typeof raw === "string" ? raw : "").trim();
		if (title === "") return c.json({ error: "bad_request", message: "Title is required" }, 400);
		await migrated(c.env.DB);
		await addTodo(d1Executor(c.env.DB), { title: title.slice(0, 200) });
		return undefined;
	},
});
