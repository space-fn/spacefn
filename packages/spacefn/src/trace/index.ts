export { traceBindings } from "./bindings";
export { configureTracing, parseOtlpHeaders, traceConfig } from "./config";
export type { TraceEnv } from "./config";
export { parseTraceparent } from "./context";
export { formatTraceparent, tracedFetch } from "./fetch";
export { isD1, traceD1 } from "./d1";
export type { D1Like } from "./d1";
export { isKV, traceKV } from "./kv";
export type { KVLike } from "./kv";
export { isQueue, traceQueue } from "./queue";
export type { QueueLike } from "./queue";
export { createLogger, setLogSink } from "./log";
export type { LogFields, LogLevel, LogRecord, LogSink, Logger } from "./log";
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
