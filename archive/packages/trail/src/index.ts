// --- @spacefn/trail -----------------------------------------------------------
// Sentry-like tracing for SpaceFn apps. One trace per request, buffered spans,
// tail-based sampling, background flush.

export type {
	Attributes,
	AttributeValue,
	EventLevel,
	EventRecord,
	SpanError,
	SpanKind,
	SpanRecord,
	SpanStatus,
	Transport,
	TrailBatch,
} from "./types.js";
export { Trail, normalizeError } from "./trail.js";
export type { Span, TrailOptions } from "./trail.js";
export { parseTraceparent, formatTraceparent } from "./traceparent.js";
export type { TraceContext } from "./traceparent.js";
export { httpTransport } from "./transport.js";
export type { HttpTransportOptions } from "./transport.js";
export { hexId, newSpanId, newTraceId } from "./id.js";
export { currentTrail, runWithTrail } from "./scope.js";
export type { TrailResolver } from "./scope.js";
export { trailFetch } from "./fetch.js";
export type { TrailFetchOptions } from "./fetch.js";
export { SDK_VERSION } from "./version.js";
