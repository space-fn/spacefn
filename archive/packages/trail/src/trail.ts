import { newSpanId, newTraceId } from "./id.js";
import type {
	AttributeValue,
	Attributes,
	EventLevel,
	EventRecord,
	SpanError,
	SpanKind,
	SpanRecord,
	Transport,
} from "./types.js";
import { SDK_VERSION } from "./version.js";

export interface TrailOptions {
	/** Continue an incoming trace. Generated when omitted. */
	traceId?: string;
	/** Span id of the remote caller, when continuing an incoming trace. */
	parentSpanId?: string;
	/** Sampling decision from the incoming `traceparent` flags. */
	sampled?: boolean;
	/** Probability that a clean trace is kept. Errors are always kept. */
	sampleRate?: number;
	transport?: Transport;
	route?: string;
	rootName?: string;
	rootKind?: SpanKind;
	/** Clock in ms. Injectable for tests. */
	now?: () => number;
	maxRecords?: number;
	/** Called when the transport fails. Telemetry never throws into the app. */
	onError?: (error: unknown) => void;
}

export interface Span {
	readonly spanId: string;
	readonly parentSpanId: string | undefined;
	readonly name: string;
	readonly kind: SpanKind;
	set(key: string, value: AttributeValue): void;
	setError(error: unknown): void;
	end(): void;
}

export function normalizeError(error: unknown): SpanError {
	if (error instanceof Error) {
		return { type: error.name || "Error", message: error.message, stack: error.stack };
	}
	if (typeof error === "string") return { type: "Error", message: error };
	try {
		return { type: "Error", message: JSON.stringify(error) };
	} catch {
		return { type: "Error", message: String(error) };
	}
}

class SpanImpl implements Span {
	readonly spanId = newSpanId();
	readonly parentSpanId: string | undefined;
	readonly name: string;
	readonly kind: SpanKind;

	#trail: Trail;
	#now: () => number;
	#startMono: number;
	#endMono: number | undefined;
	#attributes: Attributes = {};
	#error: SpanError | undefined;

	constructor(
		trail: Trail,
		now: () => number,
		name: string,
		kind: SpanKind,
		parentSpanId: string | undefined,
		startMono: number,
	) {
		this.#trail = trail;
		this.#now = now;
		this.name = name;
		this.kind = kind;
		this.parentSpanId = parentSpanId;
		this.#startMono = startMono;
	}

	set(key: string, value: AttributeValue): void {
		this.#attributes[key] = value;
	}

	setError(error: unknown): void {
		this.#error = normalizeError(error);
	}

	end(): void {
		if (this.#endMono !== undefined) return;
		this.#endMono = this.#now();
		this.#trail.recordSpan({
			traceId: this.#trail.traceId,
			spanId: this.spanId,
			parentSpanId: this.parentSpanId,
			name: this.name,
			kind: this.kind,
			status: this.#error ? "error" : "ok",
			startMs: this.#trail.epochAt(this.#startMono),
			durationMs: this.#endMono - this.#startMono,
			route: this.#trail.route,
			error: this.#error,
			attributes: Object.keys(this.#attributes).length > 0 ? this.#attributes : undefined,
		});
	}
}

/**
 * One trace = one request. Spans and events are buffered and flushed in the
 * background after the request finishes. Sampling is decided at flush time,
 * so traces containing errors are always kept regardless of `sampleRate`.
 */
export class Trail {
	readonly traceId: string;
	readonly root: Span;
	route?: string;

	#transport: Transport | undefined;
	#now: () => number;
	#startMono: number;
	#startEpoch: number;
	#sampled: boolean | undefined;
	#sampleRate: number;
	#maxRecords: number;
	#onError: ((error: unknown) => void) | undefined;

	#spans: SpanRecord[] = [];
	#events: EventRecord[] = [];
	#droppedRecords = 0;
	#hasError = false;
	#flushed = false;
	#active: Span[] = [];

	constructor(options: TrailOptions = {}) {
		this.#now = options.now ?? Date.now;
		this.#startMono = this.#now();
		this.#startEpoch = this.#startMono;
		this.traceId = options.traceId ?? newTraceId();
		this.route = options.route;
		this.#transport = options.transport;
		this.#sampled = options.sampled;
		this.#sampleRate = options.sampleRate ?? 1;
		this.#maxRecords = options.maxRecords ?? 500;
		this.#onError = options.onError;
		this.root = new SpanImpl(
			this,
			this.#now,
			options.rootName ?? "request",
			options.rootKind ?? "custom",
			options.parentSpanId,
			this.#startMono,
		);
	}

	/** Convert a monotonic reading to epoch ms via the trail's start point. */
	epochAt(mono: number): number {
		return this.#startEpoch + (mono - this.#startMono);
	}

	/**
	 * Start a span. Its parent is the innermost active span, or the root span.
	 * Call `span.end()` when done, or use `span(name, kind, fn)` below.
	 */
	startSpan(name: string, kind: SpanKind = "custom", parent?: Span): Span {
		const parentSpanId =
			parent?.spanId ?? this.#active[this.#active.length - 1]?.spanId ?? this.root.spanId;
		return new SpanImpl(this, this.#now, name, kind, parentSpanId, this.#now());
	}

	/** Run `fn` inside a span that ends (and records) when `fn` settles. */
	async span<T>(
		name: string,
		kind: SpanKind,
		fn: (span: Span) => T | Promise<T>,
		parent?: Span,
	): Promise<T> {
		const span = this.startSpan(name, kind, parent);
		this.#active.push(span);
		try {
			return await fn(span);
		} catch (error) {
			span.setError(error);
			this.error(error);
			throw error;
		} finally {
			this.#active.pop();
			span.end();
		}
	}

	/** A point-in-time note attached to the trace (breadcrumb, log line). */
	event(
		name: string,
		message: string,
		options: { level?: EventLevel; attributes?: Attributes } = {},
	): void {
		this.#pushEvent({
			traceId: this.traceId,
			name,
			level: options.level ?? "info",
			message,
			timestampMs: this.#now(),
			attributes: options.attributes,
		});
	}

	/**
	 * Record an error on the trace. Marks the trace as "always keep" at flush
	 * time, regardless of sampling.
	 */
	error(error: unknown, options: { attributes?: Attributes } = {}): void {
		this.#hasError = true;
		const normalized = normalizeError(error);
		this.#pushEvent({
			traceId: this.traceId,
			name: "error",
			level: "error",
			message: normalized.message,
			timestampMs: this.#now(),
			attributes: { error_type: normalized.type, ...options.attributes },
		});
	}

	get droppedRecords(): number {
		return this.#droppedRecords;
	}

	/** End the root span and send the batch. Idempotent; never throws. */
	async flush(): Promise<void> {
		if (this.#flushed) return;
		this.#flushed = true;
		this.root.end();
		// Tail-based sampling: errors force a keep, an explicit incoming
		// "sampled" decision is honored, otherwise decide with `sampleRate`.
		const sampledKeep =
			this.#sampled === true || (this.#sampled !== false && Math.random() < this.#sampleRate);
		if (!this.#hasError && !sampledKeep) return;
		if (!this.#transport) return;
		try {
			await this.#transport.send({
				sdk: SDK_VERSION,
				sampleInterval:
					!this.#hasError && this.#sampled !== true && this.#sampleRate > 0 && this.#sampleRate < 1
						? Math.round(1 / this.#sampleRate)
						: 1,
				spans: this.#spans,
				events: this.#events,
				droppedRecords: this.#droppedRecords,
			});
		} catch (error) {
			this.#onError?.(error);
		}
	}

	/** @internal Used by `SpanImpl` when a span ends. */
	recordSpan(record: SpanRecord): void {
		if (this.#spans.length + this.#events.length >= this.#maxRecords) {
			this.#droppedRecords++;
			return;
		}
		if (record.status === "error") this.#hasError = true;
		this.#spans.push(record);
	}

	#pushEvent(record: EventRecord): void {
		if (this.#spans.length + this.#events.length >= this.#maxRecords) {
			this.#droppedRecords++;
			return;
		}
		this.#events.push(record);
	}
}
