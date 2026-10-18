import { d1Executor, runMigrations } from "spacefn/db";

import { migrations } from "../../../.space/db/main_db";

const ready = new WeakMap<WeakKey, Promise<string[]>>();

/**
 * Applies the migrations to this database once per isolate. Two isolates that
 * start together can race; a deploy step that runs `space migrate` avoids that.
 */
export function migrated(db: unknown): Promise<string[]> {
	let pending = ready.get(db as WeakKey);
	if (!pending) {
		pending = runMigrations(d1Executor(db), migrations);
		ready.set(db as WeakKey, pending);
	}
	return pending;
}
