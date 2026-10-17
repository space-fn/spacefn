// --- Trail data model ---------------------------------------------------------

export type SpanKind =
	| "http.server"
	| "http.client"
	| "db"
	| "render"
	| "sse"
	| "browser"
	| "custom";

export type SpanStatus = "ok" | "error";

export type AttributeValue = string | number | boolean;

export type Attributes = Record<string, AttributeValue>;

export interface SpanError {
	type: string;
	message: string;
	stack?: string;
}

export interface SpanRecord {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	kind: SpanKind;
	status: SpanStatus;
	startMs: number;
	durationMs: number;
	route?: string;
	httpStatus?: number;
	error?: SpanError;
	attributes?: Attributes;
}

export type EventLevel = "info" | "warn" | "error";

export interface EventRecord {
	traceId: string;
	name: string;
	level: EventLevel;
	message: string;
	timestampMs: number;
	attributes?: Attributes;
}

export interface TrailBatch {
	sdk: string;
	/** How many original traces one kept trace represents (> 1 when sampled). */
	sampleInterval: number;
	spans: SpanRecord[];
	events: EventRecord[];
	droppedRecords: number;
}

export interface Transport {
	send(batch: TrailBatch): Promise<void>;
}
