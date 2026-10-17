import { defineHandler } from "spacefn";

import { findTodo } from "../../../.space/db/main_db";
import { migrated } from "../../db/main_db/migrate";

export const GET = defineHandler(async (c) => {
	const db = c.env.DB as object;
	await migrated(db);
	const todo = await findTodo(c.env.DB, { id: Number(c.req.param("id")) });
	return todo ?? c.json({ error: "not found" }, 404);
});
