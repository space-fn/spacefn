import { describe, expect, it, vi } from "vitest";

import { Trail, normalizeError } from "../src/trail.js";
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

describe("Trail", () => {
	it("nests spans under the innermost active span and the root", async () => {
		let t = 0;
		const transport = collector();
		const trail = new Trail({ transport, now: () => t });
		const outer = trail.startSpan("outer", "custom");
		await trail.span(
			"inner",
			"db",
			async (inner) => {
				t = 5;
				inner.set("rows", 3);
			},
			outer,
		);
		t = 10;
		outer.end();
		await trail.flush();

		const [batch] = transport.batches;
		const byName = Object.fromEntries(batch.spans.map((s) => [s.name, s]));
		expect(byName.outer.parentSpanId).toBe(trail.root.spanId);
		expect(byName.inner.parentSpanId).toBe(outer.spanId);
		expect(byName.inner.durationMs).toBe(5);
		expect(byName.inner.attributes).toEqual({ rows: 3 });
		expect(byName.request.durationMs).toBe(10);
		expect(batch.spans.every((s) => s.traceId === trail.traceId)).toBe(true);
	});

	it("records errors thrown inside span() and keeps the trace at flush", async () => {
		const transport = collector();
		const trail = new Trail({ transport, sampleRate: 0, now: () => 0 });
		await expect(
			trail.span("boom", "custom", () => {
				throw new Error("kaboom");
			}),
		).rejects.toThrow("kaboom");
		await trail.flush();

		const [batch] = transport.batches;
		expect(batch.events[0]).toMatchObject({ name: "error", level: "error", message: "kaboom" });
		const failed = batch.spans.find((s) => s.name === "boom");
		expect(failed?.status).toBe("error");
		expect(failed?.error?.type).toBe("Error");
	});

	it("drops clean traces below the sample rate but keeps error traces", async () => {
		const clean = collector();
		await new Trail({ transport: clean, sampleRate: 0, now: () => 0 }).flush();
		expect(clean.batches).toHaveLength(0);

		const failed = collector();
		const trail = new Trail({ transport: failed, sampleRate: 0, now: () => 0 });
		trail.error("manual failure");
		await trail.flush();
		expect(failed.batches).toHaveLength(1);
	});

	it("honors an incoming sampled decision", async () => {
		const kept = collector();
		await new Trail({ transport: kept, sampled: true, sampleRate: 0, now: () => 0 }).flush();
		expect(kept.batches).toHaveLength(1);

		const dropped = collector();
		await new Trail({ transport: dropped, sampled: false, sampleRate: 1, now: () => 0 }).flush();
		expect(dropped.batches).toHaveLength(0);
	});

	it("reports the sampling weight in sampleInterval", async () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
		try {
			const transport = collector();
			await new Trail({ transport, sampleRate: 0.25, now: () => 0 }).flush();
			expect(transport.batches[0].sampleInterval).toBe(4);
		} finally {
			random.mockRestore();
		}
	});

	it("caps buffered records and counts the drops", async () => {
		const transport = collector();
		const trail = new Trail({ transport, maxRecords: 3, now: () => 0 });
		for (let i = 0; i < 5; i++) trail.event("note", `message ${i}`);
		await trail.flush();

		const [batch] = transport.batches;
		// Three events fit; the 4th, 5th and the flush-time root span overflow.
		expect(batch.events).toHaveLength(3);
		expect(batch.spans).toHaveLength(0);
		expect(batch.droppedRecords).toBe(3);
		expect(trail.droppedRecords).toBe(3);
	});

	it("is idempotent on repeated flushes", async () => {
		const transport = collector();
		const trail = new Trail({ transport, now: () => 0 });
		await trail.flush();
		await trail.flush();
		expect(transport.batches).toHaveLength(1);
	});

	it("never throws into the app when the transport fails", async () => {
		const seen: unknown[] = [];
		const trail = new Trail({
			now: () => 0,
			onError: (error) => seen.push(error),
			transport: {
				async send() {
					throw new Error("ingest down");
				},
			},
		});
		await expect(trail.flush()).resolves.toBeUndefined();
		expect(seen).toHaveLength(1);
	});
});

describe("normalizeError", () => {
	it("keeps type, message, and stack for real errors", () => {
		const error = new TypeError("bad input");
		expect(normalizeError(error)).toMatchObject({ type: "TypeError", message: "bad input" });
	});

	it("handles strings and unknown shapes", () => {
		expect(normalizeError("plain")).toEqual({ type: "Error", message: "plain" });
		expect(normalizeError({ code: 7 }).message).toBe('{"code":7}');
	});
});
