import { AsyncLocalStorage } from "node:async_hooks";

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

export interface SpanContext {
	traceId: string;
	spanId: string;
}

export interface SpanRecord extends SpanContext {
	name: string;
	parentSpanId?: string;
	startTimeMs: number;
	endTimeMs: number;
	attributes: Attributes;
	error?: string;
}

export interface Span {
	readonly context: SpanContext;
	setAttributes(attributes: Attributes): void;
}

export interface Tracer {
	onEnd(record: SpanRecord): void;
}

const storage = new AsyncLocalStorage<SpanContext>();
let tracer: Tracer | undefined;

/** Installs the tracer that receives finished spans. `undefined` turns export off. */
export function setTracer(next: Tracer | undefined): void {
	tracer = next;
}

/** The span that encloses the current async work, if any. */
export function currentSpan(): SpanContext | undefined {
	return storage.getStore();
}

function hex(bytes: number): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Runs `fn` inside a span. The span joins the enclosing trace, records an
 * exception and rethrows it, and always ends.
 */
export async function withSpan<T>(
	name: string,
	fn: (span: Span) => T | Promise<T>,
	attributes: Attributes = {},
): Promise<T> {
	const parent = storage.getStore();
	const context: SpanContext = {
		traceId: parent?.traceId ?? hex(16),
		spanId: hex(8),
	};
	const record: SpanRecord = {
		...context,
		name,
		parentSpanId: parent?.spanId,
		startTimeMs: Date.now(),
		endTimeMs: 0,
		attributes: { ...attributes },
	};
	const span: Span = {
		context,
		setAttributes: (next) => {
			Object.assign(record.attributes, next);
		},
	};

	try {
		return await storage.run(context, () => fn(span));
	} catch (error) {
		record.error = error instanceof Error ? error.message : String(error);
		throw error;
	} finally {
		record.endTimeMs = Date.now();
		tracer?.onEnd(record);
	}
}
