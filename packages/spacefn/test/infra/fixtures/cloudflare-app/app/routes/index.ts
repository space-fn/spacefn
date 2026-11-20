import { head } from "@space/assets";
import MainDb from "@space/db/main.ts";
import { Effect, Option, Redacted } from "effect";
import { html, Kv, route } from "spacefn";

import Env from "../env.ts";

export default route({
	GET: Effect.gen(function* () {
		const env = yield* Env;
		const db = yield* MainDb;
		yield* db.addNote({ text: "hi" });
		const notes = Option.getOrThrow(yield* db.countNotes()).n;
		const job = Option.getOrElse(yield* (yield* Kv).get("job"), () => "none");
		const secret = Redacted.value(env.API_KEY).length;
		return html`<html>
			<head>
				${head}
			</head>
			<body>
				${env.GREETING} ${notes} ${job} ${secret}
			</body>
		</html>`;
	}),
});
