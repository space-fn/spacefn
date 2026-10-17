import type { SpanContext } from "./span";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

/** Reads a W3C `traceparent` header. Returns `undefined` for anything malformed. */
export function parseTraceparent(value: string | undefined | null): SpanContext | undefined {
	const match = value ? TRACEPARENT.exec(value.trim().toLowerCase()) : null;
	if (!match) return undefined;
	const [, traceId, spanId] = match;
	if (traceId === ZERO_TRACE || spanId === ZERO_SPAN) return undefined;
	return { traceId: traceId as string, spanId: spanId as string };
}
