import { afterEach, expect, test } from "vitest";

import { currentSpan, setTracer, withSpan, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
});

function capture() {
	setTracer({ onEnd: (record) => records.push(record) });
}

test("generates hex ids of OTLP length", async () => {
	capture();
	await withSpan("root", () => undefined);
	expect(records[0]?.traceId).toMatch(/^[0-9a-f]{32}$/);
	expect(records[0]?.spanId).toMatch(/^[0-9a-f]{16}$/);
});

test("nested spans share a trace and link to their parent", async () => {
	capture();
	await withSpan("outer", async () => {
		await withSpan("inner", () => undefined);
	});
	const [inner, outer] = records;
	expect(inner?.name).toBe("inner");
	expect(inner?.traceId).toBe(outer?.traceId);
	expect(inner?.parentSpanId).toBe(outer?.spanId);
	expect(outer?.parentSpanId).toBeUndefined();
});

test("keeps the context across awaits and concurrent work", async () => {
	capture();
	await Promise.all([
		withSpan("a", async () => {
			await new Promise((r) => setTimeout(r, 5));
			await withSpan("a.child", () => undefined);
		}),
		withSpan("b", () => undefined),
	]);
	const a = records.find((r) => r.name === "a");
	const child = records.find((r) => r.name === "a.child");
	const b = records.find((r) => r.name === "b");
	expect(child?.parentSpanId).toBe(a?.spanId);
	expect(b?.traceId).not.toBe(a?.traceId);
});

test("records and rethrows an error, and still ends the span", async () => {
	capture();
	await expect(
		withSpan("boom", () => {
			throw new Error("nope");
		}),
	).rejects.toThrow("nope");
	expect(records[0]).toMatchObject({ name: "boom", error: "nope" });
	expect(records[0]?.endTimeMs).toBeGreaterThanOrEqual(records[0]?.startTimeMs ?? 0);
});

test("exposes attributes set during the span", async () => {
	capture();
	await withSpan("db", (span) => span.setAttributes({ rows: 3 }), { system: "d1" });
	expect(records[0]?.attributes).toEqual({ system: "d1", rows: 3 });
});

test("is a no-op without a tracer but still tracks the current span", async () => {
	let inside: string | undefined;
	await withSpan("quiet", () => {
		inside = currentSpan()?.spanId;
	});
	expect(inside).toMatch(/^[0-9a-f]{16}$/);
	expect(currentSpan()).toBeUndefined();
});
