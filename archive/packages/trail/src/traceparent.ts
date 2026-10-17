// --- W3C Trace Context --------------------------------------------------------
// https://www.w3.org/TR/trace-context/

export interface TraceContext {
	traceId: string;
	spanId: string;
	sampled: boolean;
}

const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const FLAGS_RE = /^[0-9a-f]{2}$/;
const ZERO_RE = /^0+$/;

/**
 * Parse a `traceparent` header value. Returns `undefined` for missing or
 * invalid values so callers can start a fresh trace instead of failing.
 */
export function parseTraceparent(header: string | undefined | null): TraceContext | undefined {
	if (!header) return undefined;
	const parts = header.trim().split("-");
	// Version "ff" is forbidden; future versions append fields after the flags.
	if (parts.length < 4) return undefined;
	const [version, traceId, spanId, flags] = parts;
	if (version === "ff" || !FLAGS_RE.test(version)) return undefined;
	if (!TRACE_ID_RE.test(traceId) || ZERO_RE.test(traceId)) return undefined;
	if (!SPAN_ID_RE.test(spanId) || ZERO_RE.test(spanId)) return undefined;
	if (!FLAGS_RE.test(flags)) return undefined;
	return { traceId, spanId, sampled: (parseInt(flags, 16) & 0x01) === 0x01 };
}

export function formatTraceparent(ctx: TraceContext): string {
	return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? "01" : "00"}`;
}
