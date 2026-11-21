import type { DbDriver } from "spacefn";

/**
 * What the file conventions ask of the infra: `#space/infra.ts`'s `app`,
 * which `configs/infra.ts` loops over. Plain data, from `package.json` and `app/`.
 */
export interface InfraApp {
	/** `package.json`'s name: the stack's, and the prefix of what it deploys. */
	readonly name: string;
	/** The app's code folders beside `app/`, from `package.json` `imports`. */
	readonly folders: readonly string[];
	/** `app/db/<name>/`, bound as `DB_<NAME>`. */
	readonly databases: readonly {
		readonly name: string;
		readonly binding: string;
		readonly driver: DbDriver;
	}[];
	/** `app/queues/<name>.ts`, bound as `QUEUE_<NAME>`. */
	readonly queues: readonly { readonly name: string; readonly binding: string }[];
	/** Every schedule in `app/crons/`, each once. */
	readonly crons: readonly string[];
	/** `app/durable-objects/` (Cloudflare only). */
	readonly durableObjects: readonly { readonly className: string; readonly binding: string }[];
	/** `app/workflows/` (Cloudflare only). */
	readonly workflows: readonly { readonly className: string; readonly binding: string }[];
}
