import { Effect } from "effect";
import { rateLimit, route } from "spacefn";

// Two requests a minute, then 429.
export default route({
	GET: Effect.as(rateLimit("limited", { limit: 2, window: "1 minute" }), "ok"),
});
