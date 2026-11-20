import { Effect } from "effect";
import { route } from "spacefn";

export default route({
	GET: Effect.sync(() => (typeof Bun === "undefined" ? "node" : "bun")),
});
