// Deploys import this file to learn which variables to pass on, so it imports only spacefn and effect.
import { defineEnv, Env } from "spacefn";

// Without TURSO_API_TOKEN, each shop's database is a local file under .space/data/shops/.
export default defineEnv({
	/** Your Turso organization's slug. */
	TURSO_ORG: Env.string({ optional: true }),
	/** A Platform API token, to create the shops' databases: `turso auth api-tokens mint`. */
	TURSO_API_TOKEN: Env.secret({ optional: true }),
	/** The group the shops' databases go in. */
	TURSO_GROUP: Env.string({ default: "default" }),
	/** A token for every database in the group: `turso group tokens create <group>`. */
	TURSO_GROUP_TOKEN: Env.secret({ optional: true }),
});
