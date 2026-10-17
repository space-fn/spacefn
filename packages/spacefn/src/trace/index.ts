export { createOtlpExporter, toOtlpRequest } from "./otlp";
export type { OtlpExporter, OtlpOptions } from "./otlp";
export { currentSpan, setTracer, withSpan } from "./span";
export type { Attributes, AttributeValue, Span, SpanContext, SpanRecord, Tracer } from "./span";
