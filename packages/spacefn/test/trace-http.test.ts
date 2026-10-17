import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";

import {
	parseTraceparent,
	setTracer,
	traceRequest,
	type SpanRecord,
	type Tracer,
} from "../src/trace";

const records: SpanRecord[] = [];
const flush = vi.fn(async () => undefined);
const tracer: Tracer = { onEnd: (record) => records.push(record), flush };

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
	flush.mockClear();
});

function appWith() {
	const app = new Hono();
	app.use(traceRequest());
	app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));
	app.get("/boom", () => {
		throw new Error("kaboom");
	});
	return app;
}

const ctx = () => {
	const waitUntil = vi.fn();
	return { waitUntil } as never as ExecutionContext & { waitUntil: typeof waitUntil };
};

test("names the span after the matched route", async () => {
	setTracer(tracer);
	await appWith().request("/users/42");
	expect(records[0]).toMatchObject({
		name: "GET /users/:id",
		kind: "server",
		attributes: {
			"http.request.method": "GET",
			"url.path": "/users/42",
			"http.response.status_code": 200,
		},
	});
});

test("continues the trace from an incoming traceparent", async () => {
	setTracer(tracer);
	const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
	const spanId = "00f067aa0ba902b7";
	await appWith().request("/users/1", { headers: { traceparent: `00-${traceId}-${spanId}-01` } });
	expect(records[0]).toMatchObject({ traceId, parentSpanId: spanId });
});

test("marks server errors on the span", async () => {
	setTracer(tracer);
	const res = await appWith().request("/boom");
	expect(res.status).toBe(500);
	expect(records[0]).toMatchObject({ name: "GET /boom", error: "HTTP 500" });
});

test("flushes through waitUntil without blocking the response", async () => {
	setTracer(tracer);
	const context = ctx();
	await appWith().fetch(new Request("http://x/users/1"), {}, context as never);
	expect(context.waitUntil).toHaveBeenCalledTimes(1);
	expect(flush).toHaveBeenCalledTimes(1);
});

test("does nothing without a tracer", async () => {
	const res = await appWith().request("/users/1");
	expect(res.status).toBe(200);
	expect(records).toHaveLength(0);
});

test("parseTraceparent rejects malformed and all-zero values", () => {
	expect(parseTraceparent("00-" + "0".repeat(32) + "-00f067aa0ba902b7-01")).toBeUndefined();
	expect(parseTraceparent("garbage")).toBeUndefined();
	expect(parseTraceparent(undefined)).toBeUndefined();
	expect(parseTraceparent("00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01")).toEqual({
		traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
		spanId: "00f067aa0ba902b7",
	});
});

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}
