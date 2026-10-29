import { describe, expect, test } from "vite-plus/test";

import { createSSEHub } from "../src/sse";

describe("createSSEHub", () => {
	test("returns an SSE response and publishes formatted events to subscribers", async () => {
		const hub = createSSEHub();
		const first = hub.subscribe();
		const second = hub.subscribe();
		const firstReader = first.body!.getReader();
		const secondReader = second.body!.getReader();

		expect(first.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
		expect(first.headers.get("cache-control")).toBe("no-cache, no-transform");
		hub.publish({ data: "hello\r\nworld", event: "update", id: "42", retry: 3000 });

		const chunks = await Promise.all([firstReader.read(), secondReader.read()]);
		for (const chunk of chunks) {
			expect(chunk.done).toBe(false);
			expect(new TextDecoder().decode(chunk.value)).toBe(
				"event: update\nid: 42\nretry: 3000\ndata: hello\ndata: world\n\n",
			);
		}

		await Promise.all([firstReader.cancel(), secondReader.cancel()]);
	});

	test("rejects unsafe event fields and invalid retry values", () => {
		const hub = createSSEHub();
		expect(() => hub.publish({ data: "x", event: "update\ndata: injected" })).toThrow(
			/SSE event cannot contain a line break/,
		);
		expect(() => hub.publish({ data: "x", id: "bad\0id" })).toThrow(
			/SSE id cannot contain a null character/,
		);
		expect(() => hub.publish({ data: "x", retry: -1 })).toThrow(
			/SSE retry must be a non-negative integer/,
		);
		expect(() => hub.publish({ data: "x", retry: 1e21 })).toThrow(
			/SSE retry must be a non-negative integer/,
		);
	});

	test("disconnects subscribers when their bounded buffer fills", async () => {
		const hub = createSSEHub();
		const reader = hub.subscribe().body!.getReader();
		for (let index = 0; index < 17; index++) hub.publish({ data: String(index) });

		let disconnected = false;
		try {
			await reader.read();
		} catch {
			disconnected = true;
		}
		expect(disconnected).toBe(true);
	});
});
