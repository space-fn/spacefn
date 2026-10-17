import { d1Executor, runMigrations } from "spacefn/db";

import { migrations } from "../../../.space/db/main_db";

const ready = new WeakMap<object, Promise<string[]>>();

/**
 * Applies the migrations to this database once per isolate. Two isolates that
 * start together can race; a deploy step that runs `space migrate` avoids that.
 */
export function migrated(db: object): Promise<string[]> {
	let pending = ready.get(db);
	if (!pending) {
		pending = runMigrations(d1Executor(db as never), migrations);
		ready.set(db, pending);
	}
	return pending;
}
