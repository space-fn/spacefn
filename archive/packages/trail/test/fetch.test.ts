import { describe, expect, it } from "vitest";

import { trailFetch } from "../src/fetch.js";
import { Trail } from "../src/trail.js";
import type { TrailBatch, Transport } from "../src/types.js";

function collector(): Transport & { batches: TrailBatch[] } {
	const batches: TrailBatch[] = [];
	return {
		batches,
		async send(batch) {
			batches.push(batch);
		},
	};
}

describe("trailFetch", () => {
	it("records http.client spans and propagates traceparent", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const calls: { init: RequestInit }[] = [];
		const wrapped = trailFetch({
			resolve: () => trail,
			fetch: async (_input, init) => {
				calls.push({ init: init ?? {} });
				return new Response(null, { status: 200 });
			},
		});

		const res = await wrapped("https://api.example.com/things");
		expect(res.status).toBe(200);
		await trail.flush();

		const span = transport.batches[0].spans.find((s) => s.kind === "http.client");
		expect(span?.name).toBe("GET api.example.com");
		expect(span?.attributes).toMatchObject({
			"http.method": "GET",
			"http.host": "api.example.com",
			"http.status": 200,
		});
		const sent = new Headers(calls[0].init.headers).get("traceparent") ?? "";
		expect(sent).toBe(`00-${trail.traceId}-${span?.spanId}-01`);
	});

	it("marks 5xx responses as span errors without throwing", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const wrapped = trailFetch({
			resolve: () => trail,
			fetch: async () => new Response(null, { status: 503 }),
		});

		const res = await wrapped("https://api.example.com/down");
		expect(res.status).toBe(503);
		await trail.flush();

		const span = transport.batches[0].spans.find((s) => s.kind === "http.client");
		expect(span?.status).toBe("error");
		expect(span?.error?.message).toBe("HTTP 503");
	});

	it("rethrows network failures and records them", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		const wrapped = trailFetch({
			resolve: () => trail,
			fetch: async () => {
				throw new TypeError("fetch failed");
			},
		});

		await expect(wrapped("https://api.example.com/x")).rejects.toThrow("fetch failed");
		await trail.flush();

		const span = transport.batches[0].spans.find((s) => s.kind === "http.client");
		expect(span?.status).toBe("error");
		expect(span?.error?.type).toBe("TypeError");
	});

	it("is inert without a trail", async () => {
		const calls: { init: RequestInit }[] = [];
		const wrapped = trailFetch({
			resolve: () => undefined,
			fetch: async (_input, init) => {
				calls.push({ init: init ?? {} });
				return new Response(null, { status: 200 });
			},
		});

		await wrapped("https://api.example.com/x");
		expect(new Headers(calls[0].init.headers).get("traceparent")).toBeNull();
	});
});
