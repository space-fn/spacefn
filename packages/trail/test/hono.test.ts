import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { trailFrom, trailMiddleware } from "../src/hono.js";
import type { TrailBatch, Transport } from "../src/types.js";

interface Harness {
	app: Hono;
	batches: TrailBatch[];
	flushes: Promise<void>[];
	/** Resolves when the middleware schedules its flush. */
	scheduled: Promise<void>;
}

function harness(
	build: (app: Hono) => void,
	options: Parameters<typeof trailMiddleware>[0] = {},
): Harness {
	const batches: TrailBatch[] = [];
	const flushes: Promise<void>[] = [];
	const { promise: scheduled, resolve: markScheduled } = Promise.withResolvers<void>();
	const transport: Transport = {
		async send(batch) {
			batches.push(batch);
		},
	};
	const app = new Hono();
	app.use(
		"*",
		trailMiddleware({
			transport,
			scheduleFlush: (task) => {
				flushes.push(task);
				markScheduled();
			},
			...options,
		}),
	);
	build(app);
	return { app, batches, flushes, scheduled };
}

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";

describe("trailMiddleware", () => {
	it("stamps trace headers and records a root span", async () => {
		const { app, batches, flushes, scheduled } = harness((a) => {
			a.get("/", (c) => c.text("ok"));
		});
		const res = await app.request("http://localhost/");

		const traceId = res.headers.get("x-trace-id") ?? "";
		expect(traceId).toMatch(/^[0-9a-f]{32}$/);
		const spanId = (res.headers.get("traceparent") ?? "").split("-")[2] ?? "";
		expect(spanId).toMatch(/^[0-9a-f]{16}$/);
		expect(res.headers.get("traceparent")).toBe(`00-${traceId}-${spanId}-01`);
		expect(res.headers.get("server-timing")).toContain(`trail;desc="${traceId}"`);
		await scheduled;
		await Promise.all(flushes);

		const [batch] = batches;
		expect(batch.spans).toHaveLength(1);
		expect(batch.spans[0]).toMatchObject({
			name: "http.server.request",
			kind: "http.server",
			status: "ok",
		});
		expect(batch.spans[0].attributes).toMatchObject({ "http.method": "GET", "http.path": "/" });
		expect(batch.spans[0].attributes?.["http.status"]).toBe(200);
	});

	it("continues an incoming traceparent", async () => {
		const { app, batches, flushes, scheduled } = harness((a) => {
			a.get("/", (c) => c.text("ok"));
		});
		const res = await app.request("http://localhost/", {
			headers: { traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` },
		});
		await scheduled;
		await Promise.all(flushes);

		expect(res.headers.get("x-trace-id")).toBe(TRACE_ID);
		expect(batches[0].spans[0].parentSpanId).toBe(SPAN_ID);
	});

	it("records thrown handler errors with their original message", async () => {
		const { app, batches, flushes, scheduled } = harness((a) => {
			a.onError((err, c) => c.text(err.message, 500));
			a.get("/", () => {
				throw new Error("loader exploded");
			});
		});
		const res = await app.request("http://localhost/");
		await scheduled;
		await Promise.all(flushes);

		expect(res.status).toBe(500);
		expect(await res.text()).toBe("loader exploded");
		const [batch] = batches;
		expect(batch.events[0]).toMatchObject({ name: "error", message: "loader exploded" });
		expect(batch.spans[0]).toMatchObject({ name: "http.server.request", status: "error" });
	});

	it("records and rethrows non-Error failures", async () => {
		const { app, batches, flushes, scheduled } = harness((a) => {
			a.get("/", () => {
				// Hono's compose() only converts Error instances; other throws
				// reach the middleware's own catch.
				throw { failure: "custom" };
			});
		});
		await expect(app.request("http://localhost/")).rejects.toEqual({ failure: "custom" });
		await scheduled;
		await Promise.all(flushes);

		const [batch] = batches;
		expect(batch.events[0]).toMatchObject({ name: "error", message: '{"failure":"custom"}' });
		expect(batch.spans[0]).toMatchObject({ name: "http.server.request", status: "error" });
	});

	it("keeps 5xx responses even when sampling is off", async () => {
		const { app, batches, flushes, scheduled } = harness(
			(a) => {
				a.get("/", () => new Response("boom", { status: 500 }));
			},
			{ sampleRate: 0 },
		);
		await app.request("http://localhost/");
		await scheduled;
		await Promise.all(flushes);
		expect(batches).toHaveLength(1);
		expect(batches[0].events[0].attributes).toMatchObject({ http_status: 500 });
	});

	it("drops clean responses when sampling is off", async () => {
		const { app, batches, flushes, scheduled } = harness(
			(a) => {
				a.get("/", (c) => c.text("ok"));
			},
			{ sampleRate: 0 },
		);
		await app.request("http://localhost/");
		await scheduled;
		await Promise.all(flushes);
		expect(batches).toHaveLength(0);
	});

	it("ends the root span only after streamed bodies close", async () => {
		let closeStream = () => {};
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("event: datastar-patch-elements\n\n"));
				closeStream = () => controller.close();
			},
		});
		const { app, batches, flushes, scheduled } = harness((a) => {
			a.get("/", () => new Response(body, { headers: { "content-type": "text/event-stream" } }));
		});
		const res = await app.request("http://localhost/");

		expect(res.headers.get("x-trace-id")).toBeTruthy();
		expect(flushes).toHaveLength(0);

		closeStream();
		await scheduled;
		expect(flushes).toHaveLength(1);
		await Promise.all(flushes);
		expect(batches).toHaveLength(1);
		expect(batches[0].spans[0].status).toBe("ok");

		const reader = res.body?.getReader();
		const first = await reader?.read();
		expect(new TextDecoder().decode(first?.value)).toContain("datastar-patch-elements");
	});

	it("exposes the trail to handlers and is inert without a transport", async () => {
		const seen: string[] = [];
		const app = new Hono();
		app.use(
			"*",
			trailMiddleware({
				transport: { async send() {} },
				scheduleFlush: (task) => void task,
			}),
		);
		app.get("/", (c) => {
			const trail = trailFrom(c);
			if (trail) seen.push("trail-present");
			return c.text("ok");
		});
		await app.request("http://localhost/");
		expect(seen).toEqual(["trail-present"]);

		const inert = new Hono();
		inert.use("*", trailMiddleware());
		inert.get("/", (c) => c.text("ok"));
		const res = await inert.request("http://localhost/");
		expect(res.headers.get("x-trace-id")).toBeNull();
	});
});
