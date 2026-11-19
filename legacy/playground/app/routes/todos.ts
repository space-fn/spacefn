import { addTodo, listTodos } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	await migrated(c.env.DB);
	return listTodos(d1Executor(c.env.DB), {});
});

export const POST = defineHandler(async (c) => {
	await migrated(c.env.DB);
	const body = await c.req.json<{ title: string }>();
	await addTodo(d1Executor(c.env.DB), { title: body.title });
	return { created: true };
});
