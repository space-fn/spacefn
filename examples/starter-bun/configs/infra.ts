// The app's infrastructure: a plain Alchemy stack. `space deploy` runs `alchemy deploy configs/infra.ts`.
import * as Docker from "@alchemy.run/docker";
import * as Alchemy from "alchemy";
import { Effect } from "effect";
import { variables } from "spacefn/infra";

import env from "#configs/env.ts";
// What the file conventions ask for (databases, ...), as plain data from app/.
import { app } from "#space/infra.ts";

export default Alchemy.Stack(
	app.name,
	{
		providers: Docker.providers(),
		// Deploy state on this machine, in .alchemy/. To deploy from CI or several machines, keep it in
		// a shared store instead, such as Cloudflare.state() from @alchemy.run/cloudflare.
		state: Alchemy.localState(),
	},
	Effect.gen(function* () {
		const environment: Record<string, any> = {
			// configs/env.ts's variables, from .env.<stage> or the environment.
			...variables(env),
			...variables({ OTEL_EXPORTER_OTLP_ENDPOINT: "plain", OTEL_EXPORTER_OTLP_HEADERS: "secret" }),
		};
		// app/db/<name>/: a libSQL server reads DB_<NAME>_URL and DB_<NAME>_AUTH_TOKEN; without them, a file in /data.
		for (const db of app.databases)
			Object.assign(
				environment,
				variables({ [`${db.binding}_URL`]: "plain", [`${db.binding}_AUTH_TOKEN`]: "secret" }),
			);

		// To run it all on another machine, add `context` to each resource below:
		// const context = yield* Docker.Context("Host", { docker: "host=ssh://deploy@example.com" });
		const image = yield* Docker.Image("Image", {
			name: app.name,
			skipPush: true,
			// Built from the source by configs/Dockerfile, which runs vite build.
			build: { context: ".", dockerfile: "configs/Dockerfile" },
		});
		// File databases, the state database and blobs.
		const data = yield* Docker.Volume("Data");
		const port = 3000;
		yield* Docker.Container("App", {
			image,
			start: true,
			restart: "unless-stopped",
			ports: [{ external: port, internal: 3000 }],
			volumes: [{ hostPath: data.name, containerPath: "/data" }],
			environment,
			// SIGTERM lets requests finish and hands queue messages back.
			stopTimeout: "30 seconds",
		});
		return { url: `http://localhost:${port}` };
	}),
);
