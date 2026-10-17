import { defineCron } from "spacefn/crons";
import { isPurgeDue, type TenantStatus } from "spacefn/tenancy";

import type { Tenant } from "../.space/tenant";

interface Bindings {
	DB: D1Database;
	TENANTS: DurableObjectNamespace<Tenant>;
	BACKUPS: R2Bucket;
}

/**
 * Daily: backs up every live tenant to R2, and purges deleted tenants whose
 * grace period has ended. A purge exports and verifies the backup before it
 * wipes anything. A failed tenant is reported and the others still run.
 *
 * Imports of the generated code happen inside the handler: the config loader
 * reads this file under plain Node, which cannot load the generated `.ts` files.
 */
export default defineCron("0 2 * * *", async (_event, env) => {
	const { DB, TENANTS, BACKUPS } = env as Bindings;
	const { listTenants, setPurged } = await import("../.space/queries");
	const { migrated } = await import("../db/migrate");
	await migrated(DB);

	const now = new Date();
	const day = now.toISOString().slice(0, 10);
	const failures: string[] = [];

	for (const row of await listTenants(DB, {})) {
		const state = { status: row.status as TenantStatus, deletedAt: row.deletedAt ?? undefined };
		const stub = TENANTS.getByName(row.internalId);
		try {
			if (isPurgeDue(state, now.getTime())) {
				const key = `purged/${row.internalId}.json`;
				await BACKUPS.put(key, JSON.stringify(await stub.exportData()));
				const stored = await BACKUPS.head(key);
				if (!stored) throw new Error(`backup ${key} was not stored`);
				await stub.wipe();
				await setPurged(DB, { slug: row.slug });
			} else if (state.status === "active" || state.status === "suspended") {
				await BACKUPS.put(
					`daily/${day}/${row.internalId}.json`,
					JSON.stringify(await stub.exportData()),
				);
			}
		} catch (error) {
			failures.push(`${row.slug}: ${(error as Error).message}`);
		}
	}

	if (failures.length > 0) throw new Error(`Tenant maintenance failed for ${failures.join("; ")}`);
});
