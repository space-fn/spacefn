import { defineHandler } from "spacefn";

import { addTodo, listTodos } from "../../.space/db/main_db";
import { migrated } from "../db/main_db/migrate";

export const GET = defineHandler(async (c) => {
	await migrated(c.env.DB);
	return listTodos(c.env.DB, {});
});

export const POST = defineHandler(async (c) => {
	await migrated(c.env.DB);
	const body = await c.req.json<{ title: string }>();
	await addTodo(c.env.DB, { title: body.title });
	return { created: true };
});
