// The Docker deploy test's stack: the scaffolded one, on port 4890, without configs/env.ts.
import * as Docker from "@alchemy.run/docker";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

import { app } from "#space/infra.ts";

export default Alchemy.Stack(
	app.name,
	{ providers: Docker.providers(), state: Alchemy.localState() },
	Effect.gen(function* () {
		const image = yield* Docker.Image("Image", {
			name: app.name,
			skipPush: true,
			build: { context: ".", dockerfile: "configs/Dockerfile" },
		});
		const data = yield* Docker.Volume("Data");
		yield* Docker.Container("App", {
			image,
			start: true,
			restart: "unless-stopped",
			ports: [{ external: 4890, internal: 3000 }],
			volumes: [{ hostPath: data.name, containerPath: "/data" }],
			stopTimeout: "30 seconds",
		});
		return { url: "http://localhost:4890" };
	}),
);
