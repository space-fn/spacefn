import { readSignals } from "@spacefn/datastar/server"

import { getDb } from "../../../db/main/client"
import { fetchTodos, todoListSSE } from "../../../api-helpers"

interface DeleteSignals {
	id: number
}

export default async function (request: Request): Promise<Response> {
	const signals = await readSignals<DeleteSignals>(request)

	if (!signals.id) {
		return new Response("Missing todo id", { status: 400 })
	}

	const db = getDb()

	await db
		.deleteFrom("todos")
		.where("id", "=", signals.id)
		.execute()

	const todos = await fetchTodos()
	return todoListSSE(todos)
}
