import { Hono } from "hono";
import { describe, expect, test } from "vite-plus/test";

import { defineEnv, env, number, string } from "../src/env";
import { envMiddleware } from "../src/runtime";

const schema = defineEnv({ NAME: string(), LIMIT: number({ default: 5 }) });

function appWith(handler: () => unknown) {
	const app = new Hono();
	app.use(envMiddleware(schema));
	app.onError((error, c) => c.text(error.message, 500));
	app.get("/", (c) => c.json(handler()));
	return app;
}

describe("env", () => {
	test("cannot be read before a request binds it", () => {
		expect(() => (env as Record<string, unknown>).NAME).toThrow("env is not ready");
	});

	test("exposes parsed values inside a request", async () => {
		const app = appWith(() => ({
			name: (env as Record<string, unknown>).NAME,
			limit: (env as Record<string, unknown>).LIMIT,
		}));
		const res = await app.request("/", {}, { NAME: "space", LIMIT: "9" });
		expect(await res.json()).toEqual({ name: "space", limit: 9 });
	});

	test("supports spreading and has", async () => {
		const app = appWith(() => ({ ...env, hasName: "NAME" in env }));
		const res = await app.request("/", {}, { NAME: "space" });
		expect(await res.json()).toEqual({ NAME: "space", LIMIT: 5, hasName: true });
	});

	test("fails the request with every problem listed", async () => {
		const res = await appWith(() => ({})).request("/", {}, { LIMIT: "x" });
		expect(res.status).toBe(500);
		expect(await res.text()).toContain("NAME is required");
	});

	test("parses once per env object", async () => {
		const raw = { NAME: "a" };
		const app = appWith(() => (env as Record<string, unknown>).NAME);
		await app.request("/", {}, raw);
		raw.NAME = "changed";
		const res = await app.request("/", {}, raw);
		expect(await res.json()).toBe("a");
	});

	test("keeps env isolated across overlapping requests", async () => {
		let releaseFirst!: () => void;
		let signalFirstStarted!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const firstStarted = new Promise<void>((resolve) => {
			signalFirstStarted = resolve;
		});
		const app = new Hono();
		app.use(envMiddleware(schema));
		app.get("/", async (c) => {
			if ((c.env as { NAME: string }).NAME === "first") {
				signalFirstStarted();
				await firstGate;
			}
			return c.text(String((env as Record<string, unknown>).NAME));
		});

		const firstResponse = app.request("/", {}, { NAME: "first" });
		await firstStarted;
		const secondResponse = await app.request("/", {}, { NAME: "second" });
		releaseFirst();

		expect(await secondResponse.text()).toBe("second");
		expect(await (await firstResponse).text()).toBe("first");
	});
});
