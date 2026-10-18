import { afterEach, expect, test, vi } from "vite-plus/test";

import { generateWorkerSource } from "../src/entry";
import { defineQueue, queueBinding, queueConfig, type QueueBatch } from "../src/queues";
import { dispatchQueue } from "../src/queues/dispatch";
import { setTracer, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
});

function batchOf(queue: string, bodies: unknown[]): QueueBatch<unknown> {
	const messages = bodies.map((body, i) => ({
		id: `m${i}`,
		body,
		attempts: 1,
		ack: vi.fn(),
		retry: vi.fn(),
	}));
	return {
		queue,
		messages,
		ackAll: vi.fn(),
		retryAll: vi.fn(),
	};
}

const ctx = () => ({ waitUntil: vi.fn() });

test("names bindings after the file", () => {
	expect(queueBinding("emails.ts")).toBe("QUEUE_EMAILS");
	expect(queueBinding("order-jobs.ts")).toBe("QUEUE_ORDER_JOBS");
});

test("config has a consumer trigger and a producer binding per queue", () => {
	const config = queueConfig(["emails.ts"]);
	expect(Object.keys(config.env)).toEqual(["QUEUE_EMAILS"]);
	expect(config.env.QUEUE_EMAILS).toMatchObject({ type: "queue", name: "emails" });
	expect(config.triggers).toEqual([expect.objectContaining({ type: "queue", name: "emails" })]);
});

test("dispatch calls the consumer registered for the batch's queue", async () => {
	const seen: unknown[] = [];
	const emails = defineQueue<{ to: string }>(async (batch) => {
		for (const message of batch.messages) seen.push(message.body);
	});
	const context = ctx();
	await dispatchQueue(batchOf("emails", [{ to: "a@x" }, { to: "b@x" }]), {}, context, {
		emails,
	} as never);
	expect(seen).toEqual([{ to: "a@x" }, { to: "b@x" }]);
});

test("dispatch flushes spans through waitUntil when export is on", async () => {
	const flush = vi.fn(async () => undefined);
	setTracer({ onEnd: () => undefined, flush });
	const context = ctx();
	await dispatchQueue(batchOf("emails", [{}]), {}, context, {
		emails: defineQueue(async () => undefined),
	} as never);
	expect(context.waitUntil).toHaveBeenCalledTimes(1);
	expect(flush).toHaveBeenCalledTimes(1);
});

test("dispatch fails loudly and retries when no consumer exists", async () => {
	const batch = batchOf("orphans", [{}]);
	await expect(dispatchQueue(batch, {}, ctx(), {})).rejects.toThrow(
		'No consumer is registered for queue "orphans"',
	);
	// eslint-disable-next-line @typescript-eslint/unbound-method
	expect(batch.retryAll).toHaveBeenCalledTimes(1);
});

test("dispatch wraps the batch in a consumer span", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	const emails = defineQueue(async () => undefined);
	await dispatchQueue(batchOf("emails", [{}, {}]), {}, ctx(), { emails });
	expect(records[0]).toMatchObject({
		name: "queue.process",
		kind: "consumer",
		attributes: {
			"messaging.destination.name": "emails",
			"messaging.batch.message_count": 2,
		},
	});
});

test("a failing consumer records an error on its span and rethrows", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	const broken = defineQueue(async () => {
		throw new Error("smtp down");
	});
	await expect(
		dispatchQueue(batchOf("emails", [{}]), {}, ctx(), { emails: broken }),
	).rejects.toThrow("smtp down");
	expect(records[0]?.error).toBe("smtp down");
});

test("the worker entry routes queue batches only when queues exist", () => {
	expect(generateWorkerSource({})).not.toContain("queue:");
	const source = generateWorkerSource({ queues: ["emails.ts"] });
	expect(source).toContain('import queue0 from "../app/queues/emails";');
	expect(source).toContain('"emails": queue0,');
	expect(source).toContain(
		'import { Hono, runWithBindings, traceBindings, traceConfig, traceRequest, envMiddleware, dispatchQueue, type QueueBatch } from "spacefn/runtime";',
	);
});
