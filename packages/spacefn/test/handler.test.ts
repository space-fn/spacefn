import { Hono } from "hono";
import { describe, expect, test } from "vite-plus/test";

import { defineHandler, onError as defaultOnError } from "../src/handler";

// Mirrors the generated createApp, which registers the default error handler.
function call(handler: Parameters<typeof defineHandler>[0]) {
	const app = new Hono();
	app.onError(defaultOnError);
	app.get("/", defineHandler(handler));
	return app.request("/");
}

test("passes a Response through", async () => {
	const res = await call(() => new Response("raw", { status: 201 }));
	expect(res.status).toBe(201);
	expect(await res.text()).toBe("raw");
});

test("turns a string into text", async () => {
	const res = await call(() => "hello");
	expect(res.headers.get("content-type")).toContain("text/plain");
	expect(await res.text()).toBe("hello");
});

test("turns an object into JSON", async () => {
	const res = await call(() => ({ ok: true }));
	expect(await res.json()).toEqual({ ok: true });
});

test("turns undefined into 204", async () => {
	const res = await call(() => undefined);
	expect(res.status).toBe(204);
});

test("awaits async handlers", async () => {
	const res = await call(async () => ({ n: 1 }));
	expect(await res.json()).toEqual({ n: 1 });
});

import { SpaceError } from "../src/errors";
import { onError } from "../src/handler";

describe("onError", () => {
	test("maps SpaceError with status", async () => {
		const app = new Hono();
		app.onError(onError);
		app.get("/", () => {
			throw new SpaceError("X", "boom", { status: 413 });
		});
		const res = await app.request("/");
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "X", message: "boom" });
	});

	test("generic 500 without leak", async () => {
		const app = new Hono();
		app.onError(onError);
		app.get("/", () => {
			throw new Error("secret internals");
		});
		const res = await app.request("/");
		expect(res.status).toBe(500);
		const json = (await res.json()) as { message: string };
		expect(json.message).not.toContain("secret");
	});

	test("SpaceError without status is 500", async () => {
		const app = new Hono();
		app.onError(onError);
		app.get("/", () => {
			throw new SpaceError("X", "boom");
		});
		const res = await app.request("/");
		expect(res.status).toBe(500);
	});
});

describe("defineHandler error mapping", () => {
	test("SpaceError maps to its status", async () => {
		const res = await call(() => {
			throw new SpaceError("X", "boom", { status: 413 });
		});
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "X", message: "boom" });
	});

	test("SpaceError 415", async () => {
		const res = await call(() => {
			throw new SpaceError("Y", "bad type", { status: 415 });
		});
		expect(res.status).toBe(415);
	});

	test("plain error is 500", async () => {
		const res = await call(() => {
			throw new Error("secret");
		});
		expect(res.status).toBe(500);
		const json = (await res.json()) as { message: string };
		expect(json.message).not.toContain("secret");
	});

	test("an error reaches the app's own app.onError", async () => {
		class AppError extends Error {}
		const app = new Hono();
		app.onError((error, c) =>
			error instanceof AppError ? c.json({ mine: true }, 404) : defaultOnError(error, c),
		);
		app.get(
			"/",
			defineHandler(() => {
				throw new AppError("missing");
			}),
		);
		const res = await app.request("/");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ mine: true });
	});

	test("a per-handler onError still wins", async () => {
		const app = new Hono();
		app.onError(() => new Response("app", { status: 500 }));
		app.get(
			"/",
			defineHandler(
				() => {
					throw new Error("x");
				},
				{ onError: (_error, c) => c.text("handler", 418) },
			),
		);
		const res = await app.request("/");
		expect(res.status).toBe(418);
	});
});
