import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Migration } from "./migrate";

const FILE = /^(\d+)_([A-Za-z0-9_-]+)\.sql$/;

/**
 * Reads `db/migrations/NNNN_name.sql`, ordered by number. Two files with the same
 * number are an error, so a bad merge cannot silently pick one of them.
 */
export async function scanMigrations(dir: string): Promise<Migration[]> {
	const entries = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return [];
		throw error;
	});

	const files = entries
		.filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
		.map((name) => {
			const match = FILE.exec(name);
			if (!match)
				throw new Error(
					`Migration ${name} must be named NNNN_name.sql (e.g. 0001_create_todos.sql)`,
				);
			return { name, number: Number(match[1]) };
		})
		.sort((a, b) => a.number - b.number);

	for (let i = 1; i < files.length; i++) {
		if (files[i - 1]?.number === files[i]?.number) {
			throw new Error(
				`Migrations ${files[i - 1]?.name} and ${files[i]?.name} share the number ${files[i]?.number}`,
			);
		}
	}

	return Promise.all(
		files.map(async ({ name }) => {
			const raw = await readFile(join(dir, name), "utf8");
			const { up, down } = splitUpDown(raw);
			if (!up) throw new Error(`Migration ${name} is missing a "-- up" section.`);
			return { id: name.replace(/\.sql$/, ""), sql: up, down };
		}),
	);

function splitUpDown(raw: string): { up: string; down?: string } {
	const lines = raw.split(/\r?\n/);
	let section: "up" | "down" | null = null;
	const up: string[] = [];
	const down: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim().toLowerCase();
		if (trimmed === "-- up") {
			section = "up";
			continue;
		}
		if (trimmed === "-- down") {
			section = "down";
			continue;
		}
		if (section === "up") up.push(line);
		else if (section === "down") down.push(line);
	}
	return { up: up.join("\n").trim(), down: down.join("\n").trim() || undefined };
}
}
