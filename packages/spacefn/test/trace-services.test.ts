import { afterEach, expect, test } from "vitest";

import {
	setTracer,
	traceBindings,
	traceKV,
	traceQueue,
	type KVLike,
	type QueueLike,
	type SpanRecord,
} from "../src/trace";

const records: SpanRecord[] = [];

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
});

function capture() {
	setTracer({ onEnd: (record) => records.push(record) });
}

function fakeKV(): KVLike {
	const value = async () => "stored";
	return {
		get: value,
		getWithMetadata: value,
		put: async () => undefined,
		delete: async () => undefined,
		list: async () => ({ keys: [] }),
	};
}

test("traces KV operations without recording keys", async () => {
	capture();
	const kv = traceKV(fakeKV());
	expect(await kv.get("session:secret-token")).toBe("stored");
	await kv.put("k", "v");
	await kv.delete("k");
	expect(records.map((r) => r.name)).toEqual(["kv.get", "kv.put", "kv.delete"]);
	expect(records[0]?.attributes).toEqual({ "db.system": "kv", "db.operation.name": "get" });
	expect(JSON.stringify(records)).not.toContain("secret-token");
});

test("traces queue publishing with the message count and no bodies", async () => {
	capture();
	const sent: unknown[] = [];
	const queue = traceQueue({
		send: async (body) => {
			sent.push(body);
		},
		sendBatch: async (messages) => {
			sent.push(...messages);
		},
	} satisfies QueueLike);

	await queue.send({ email: "private@example.com" });
	await queue.sendBatch([{ n: 1 }, { n: 2 }]);

	expect(sent).toHaveLength(3);
	expect(records[0]).toMatchObject({
		name: "queue.publish",
		attributes: { "messaging.operation.name": "send", "messaging.batch.message_count": 1 },
	});
	expect(records[1]?.attributes["messaging.batch.message_count"]).toBe(2);
	expect(JSON.stringify(records)).not.toContain("private@example.com");
});

test("traceBindings wraps KV and queue bindings and keeps identity", () => {
	const kv = fakeKV();
	const queue = { send: async () => undefined, sendBatch: async () => undefined };
	const env = { CACHE: kv, JOBS: queue, FLAG: "on" };
	const traced = traceBindings(env);
	expect(traced.CACHE).not.toBe(kv);
	expect(traced.JOBS).not.toBe(queue);
	expect(traced.FLAG).toBe("on");
	expect(traced.CACHE).toBe(traced.CACHE);
});
