import { Effect } from "effect";
import { html, Kv, route } from "spacefn";
import { head } from "spacefn/assets";

export default route({
	GET: Effect.gen(function* () {
		const job = yield* Kv.get("job");
		return html`<!doctype html>
			<html>
				<head>
					${head}
				</head>
				<body>
					${job._tag === "Some" ? job.value : "none"}
				</body>
			</html>`;
	}),
});
