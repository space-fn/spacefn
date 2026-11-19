import { findTodo } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	await migrated(c.env.DB);
	const todo = await findTodo(d1Executor(c.env.DB), { id: Number(c.req.param("id")) });
	return todo ?? c.json({ error: "not found" }, 404);
});
