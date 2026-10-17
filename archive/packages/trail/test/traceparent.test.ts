import { describe, expect, it } from "vitest";

import { formatTraceparent, parseTraceparent } from "../src/traceparent.js";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";

describe("parseTraceparent", () => {
	it("parses a valid header", () => {
		expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-01`)).toEqual({
			traceId: TRACE_ID,
			spanId: SPAN_ID,
			sampled: true,
		});
	});

	it("reads the sampled flag from the lowest bit", () => {
		expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-00`)?.sampled).toBe(false);
		expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-03`)?.sampled).toBe(true);
	});

	it("accepts future versions with extra fields", () => {
		expect(parseTraceparent(`01-${TRACE_ID}-${SPAN_ID}-01-extra`)?.traceId).toBe(TRACE_ID);
	});

	it("rejects malformed and forbidden values", () => {
		expect(parseTraceparent(undefined)).toBeUndefined();
		expect(parseTraceparent("")).toBeUndefined();
		expect(parseTraceparent(`ff-${TRACE_ID}-${SPAN_ID}-01`)).toBeUndefined();
		expect(parseTraceparent(`00-${"0".repeat(32)}-${SPAN_ID}-01`)).toBeUndefined();
		expect(parseTraceparent(`00-${TRACE_ID}-${"0".repeat(16)}-01`)).toBeUndefined();
		expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}`)).toBeUndefined();
		expect(parseTraceparent(`00-short-${SPAN_ID}-01`)).toBeUndefined();
	});
});

describe("formatTraceparent", () => {
	it("round-trips through parseTraceparent", () => {
		const ctx = { traceId: TRACE_ID, spanId: SPAN_ID, sampled: true };
		expect(parseTraceparent(formatTraceparent(ctx))).toEqual(ctx);
		expect(formatTraceparent({ ...ctx, sampled: false })).toBe(`00-${TRACE_ID}-${SPAN_ID}-00`);
	});
});
