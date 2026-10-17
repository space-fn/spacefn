export { parseTraceparent } from "./context";
export { traceRequest } from "./http";
export { createOtlpExporter, toOtlpRequest } from "./otlp";
export type { OtlpExporter, OtlpOptions } from "./otlp";
export { currentSpan, getTracer, setTracer, withSpan } from "./span";
export type {
	Attributes,
	AttributeValue,
	Span,
	SpanContext,
	SpanKind,
	SpanOptions,
	SpanRecord,
	Tracer,
} from "./span";
