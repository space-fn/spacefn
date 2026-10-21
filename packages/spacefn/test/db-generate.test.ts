import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { generateDbSource } from "../src/db/generate-db";

/** Writes generated source to a temp file with its `spacefn/db` import pointed at our source. */
async function importGenerated(migrations: Parameters<typeof generateDbSource>[1]) {
	const src = generateDbSource("main", migrations, []);
	const dbModule = new URL("../src/db.ts", import.meta.url).pathname;
	const file = join(mkdtempSync(join(tmpdir(), "generated-db-")), "main.ts");
	writeFileSync(file, src.replaceAll('from "spacefn/db"', `from ${JSON.stringify(dbModule)}`));
	return (await import(/* @vite-ignore */ file)) as {
		migrated: (db: unknown) => Promise<string[]>;
	};
}

test("generated migrated(): a failed first run is not cached and can be retried", async () => {
	const mod = await importGenerated([{ id: "0001_t", sql: "CREATE TABLE t (id INTEGER)" }]);
	let failFirst = true;
	let calls = 0;
	const db = {
		prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }),
		batch: async () => {
			calls++;
			if (failFirst) {
				failFirst = false;
				throw new Error("transient D1 error");
			}
			return [];
		},
	};
	await expect(mod.migrated(db)).rejects.toThrow("transient");
	calls = 0;
	await expect(mod.migrated(db)).resolves.toBeDefined();
	expect(calls).toBeGreaterThan(0);
});

test("generated migrated(): a successful run is cached", async () => {
	const mod = await importGenerated([{ id: "0001_t", sql: "CREATE TABLE t (id INTEGER)" }]);
	let calls = 0;
	const db = {
		prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }),
		batch: async () => {
			calls++;
			return [];
		},
	};
	await expect(mod.migrated(db)).resolves.toBeDefined();
	calls = 0;
	await expect(mod.migrated(db)).resolves.toBeDefined();
	expect(calls).toBe(0);
});
