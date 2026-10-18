import { defineHandler } from "spacefn";

import { findTodo } from "@space/db/main_db";
import { migrated } from "@app/db/main_db/migrate";

export const GET = defineHandler(async (c) => {
	await migrated(c.env.DB);
	const todo = await findTodo(c.env.DB, { id: Number(c.req.param("id")) });
	return todo ?? c.json({ error: "not found" }, 404);
});
