import { describe, expect, it } from "vitest";

import { httpTransport } from "../src/transport.js";
import type { TrailBatch } from "../src/types.js";

const EMPTY_BATCH: TrailBatch = {
	sdk: "test",
	sampleInterval: 1,
	spans: [],
	events: [],
	droppedRecords: 0,
};

describe("httpTransport", () => {
	it("POSTs the batch as JSON with the ingest key", async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const transport = httpTransport({
			endpoint: "https://ingest.example/v1/events",
			key: "wk_test",
			fetch: async (url, init) => {
				calls.push({ url: String(url), init: init ?? {} });
				return new Response(null, { status: 202 });
			},
		});
		await transport.send(EMPTY_BATCH);

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://ingest.example/v1/events");
		expect(calls[0].init.method).toBe("POST");
		expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer wk_test");
		expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ sdk: "test" });
		expect(calls[0].init.keepalive).toBe(true);
	});

	it("omits the authorization header without a key", async () => {
		let headers = new Headers();
		const transport = httpTransport({
			endpoint: "https://ingest.example/v1/events",
			fetch: async (_url, init) => {
				headers = new Headers(init?.headers);
				return new Response(null, { status: 202 });
			},
		});
		await transport.send(EMPTY_BATCH);
		expect(headers.get("authorization")).toBeNull();
	});

	it("throws on non-2xx responses", async () => {
		const transport = httpTransport({
			endpoint: "https://ingest.example/v1/events",
			fetch: async () => new Response(null, { status: 429 }),
		});
		await expect(transport.send(EMPTY_BATCH)).rejects.toThrow("HTTP 429");
	});
});
