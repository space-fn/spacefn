import { readSignals } from "@spacefn/datastar/server";

import { fetchTodos, todoListSSE } from "../../../api-helpers";
import { getDb } from "../../../db/main/client";

interface UpdateSignals {
	id: number;
	title?: string;
	description?: string;
}

export default async function (request: Request): Promise<Response> {
	const signals = await readSignals<UpdateSignals>(request);

	if (!signals.id) {
		return new Response("Missing todo id", { status: 400 });
	}

	const db = getDb();

	const sets: Record<string, unknown> = {};
	if (signals.title !== undefined) sets.title = signals.title.trim();
	if (signals.description !== undefined) sets.description = signals.description.trim() || null;

	if (Object.keys(sets).length === 0) {
		return new Response("Nothing to update", { status: 400 });
	}

	await db.updateTable("todos").set(sets).where("id", "=", signals.id).execute();

	const todos = await fetchTodos();
	return todoListSSE(todos);
}
