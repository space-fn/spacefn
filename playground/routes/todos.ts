import { defineHandler } from "spacefn";

export const GET = defineHandler(async (c) => {
	const db = c.env.DB as D1Database;
	await db.prepare("CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, title TEXT)").run();
	const { results } = await db.prepare("SELECT id, title FROM todos").all();
	return results;
});
