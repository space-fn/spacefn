import { Effect } from "effect";
import { route } from "spacefn";

// GET /health answers JSON, for uptime checks.
export default route({
	GET: Effect.succeed({ ok: true }),
});
