import { parseTraceparent } from "./context";
import { formatTraceparent } from "./fetch";
import type { SpanContext } from "./span";

/** Key that marks a queue body as carrying trace context. */
export const ENVELOPE_KEY = "$spacefn";

export interface QueueEnvelope {
	[ENVELOPE_KEY]: { version: 1; traceparent: string };
	body: unknown;
}

/** Wraps a message body so the consumer can continue the publishing trace. */
export function wrapQueueBody(body: unknown, context: SpanContext): QueueEnvelope {
	return { [ENVELOPE_KEY]: { version: 1, traceparent: formatTraceparent(context) }, body };
}

function isEnvelope(value: unknown): value is QueueEnvelope {
	return typeof value === "object" && value !== null && ENVELOPE_KEY in value && "body" in value;
}

/**
 * Returns the body a consumer should see, plus the trace it was published in.
 * Bodies without an envelope pass through unchanged, with no trace.
 */
export function unwrapQueueBody(value: unknown): { body: unknown; context?: SpanContext } {
	if (!isEnvelope(value)) return { body: value };
	return { body: value.body, context: parseTraceparent(value[ENVELOPE_KEY].traceparent) };
}
