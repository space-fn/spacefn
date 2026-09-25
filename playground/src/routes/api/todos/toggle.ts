import { readSignals } from "@spacefn/datastar/server"

import { getDb } from "../../../db/main/client"
import { fetchTodos, todoListSSE } from "../../../api-helpers"

interface ToggleSignals {
	id: number
}

export default async function (request: Request): Promise<Response> {
	const signals = await readSignals<ToggleSignals>(request)

	if (!signals.id) {
		return new Response("Missing todo id", { status: 400 })
	}

	const db = getDb()

	// Toggle completed: flip the current value
	await db
		.updateTable("todos")
		.set({
			completed: db
				.selectFrom("todos")
				.select(({ eb }) =>
					eb.not("completed").as("completed"),
				)
				.where("id", "=", signals.id)
				.limit(1),
		})
		.where("id", "=", signals.id)
		.execute()

	const todos = await fetchTodos()
	return todoListSSE(todos)
}
