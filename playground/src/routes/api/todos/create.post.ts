import { readSignals } from "@spacefn/datastar/server";

import { fetchTodos, todoListSSE } from "../../../api-helpers";
import { getDb } from "../../../db/main/client";

interface CreateSignals {
	title: string;
	description?: string;
	categoryId?: string;
	priority?: string;
}

export default async function (request: Request): Promise<Response> {
	const signals = await readSignals<CreateSignals>(request);

	if (!signals.title?.trim()) {
		return new Response("Title is required", { status: 400 });
	}

	const db = getDb();

	await db
		.insertInto("todos")
		.values({
			title: signals.title.trim(),
			description: signals.description?.trim() || null,
			categoryId: signals.categoryId ? Number(signals.categoryId) : null,
			priority: (signals.priority as "low" | "medium" | "high") || "medium",
		})
		.execute();

	const todos = await fetchTodos();
	return todoListSSE(todos);
}
