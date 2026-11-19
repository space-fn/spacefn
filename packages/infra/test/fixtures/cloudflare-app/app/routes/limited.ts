import { Effect } from "effect";
import { rateLimit, route } from "spacefn";

export default route({
	GET: Effect.as(rateLimit("fixture", { limit: 2, window: "1 minute" }), "ok"),
});
