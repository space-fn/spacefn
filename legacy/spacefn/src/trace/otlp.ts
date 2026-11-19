import type { Attributes, AttributeValue, SpanRecord, Tracer } from "./span";

export interface OtlpOptions {
	/** Full traces URL, e.g. `https://api.honeycomb.io/v1/traces`. */
	endpoint: string;
	/** Extra request headers, such as an auth token. */
	headers?: Record<string, string>;
	serviceName: string;
	/** Injected in tests. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** Called when an export fails. Export failures never reach the request. */
	onError?: (error: unknown) => void;
}

export interface OtlpExporter extends Tracer {
	/** Sends every buffered span in one request. Resolves even when the send fails. */
	flush(): Promise<void>;
}

type OtlpValue =
	| { stringValue: string }
	| { intValue: string }
	| { doubleValue: number }
	| { boolValue: boolean };

function encodeValue(value: AttributeValue): OtlpValue {
	if (typeof value === "string") return { stringValue: value };
	if (typeof value === "boolean") return { boolValue: value };
	return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
}

const REDACTED_KEYS = /secret|token|password|api[_-]?key|authorization|cookie|header/i;

function encodeAttributes(attributes: Attributes) {
	return Object.entries(attributes).map(([key, value]) => ({
		key,
		value: REDACTED_KEYS.test(key) ? { stringValue: "[redacted]" } : encodeValue(value),
	}));
}

function nanos(ms: number): string {
	return (BigInt(ms) * 1_000_000n).toString();
}

const OTLP_KIND = { internal: 1, server: 2, client: 3, producer: 4, consumer: 5 } as const;

function encodeSpan(record: SpanRecord) {
	return {
		traceId: record.traceId,
		spanId: record.spanId,
		...(record.parentSpanId ? { parentSpanId: record.parentSpanId } : {}),
		name: record.name,
		kind: OTLP_KIND[record.kind],
		startTimeUnixNano: nanos(record.startTimeMs),
		endTimeUnixNano: nanos(record.endTimeMs),
		attributes: encodeAttributes(record.attributes),
		status: record.error ? { code: 2, message: record.error } : { code: 1 },
	};
}

/** Builds an OTLP/JSON `ExportTraceServiceRequest` for `records`. */
export function toOtlpRequest(records: SpanRecord[], serviceName: string) {
	return {
		resourceSpans: [
			{
				resource: {
					attributes: [{ key: "service.name", value: { stringValue: serviceName } }],
				},
				scopeSpans: [
					{
						scope: { name: "spacefn" },
						spans: records.map(encodeSpan),
					},
				],
			},
		],
	};
}

export function createOtlpExporter(options: OtlpOptions): OtlpExporter {
	const send = options.fetch ?? fetch;
	const report =
		options.onError ?? ((error) => console.error("[spacefn] span export failed", error));
	let buffer: SpanRecord[] = [];

	return {
		onEnd(record) {
			buffer.push(record);
		},
		async flush() {
			if (buffer.length === 0) return;
			const batch = buffer;
			buffer = [];
			try {
				const response = await send(options.endpoint, {
					method: "POST",
					headers: { "content-type": "application/json", ...options.headers },
					body: JSON.stringify(toOtlpRequest(batch, options.serviceName)),
					keepalive: true,
				});
				if (!response.ok) report(new Error(`OTLP endpoint answered ${response.status}`));
			} catch (error) {
				report(error);
			}
		},
	};
}
