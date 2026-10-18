import { afterEach, expect, test } from "vite-plus/test";

import { setTracer, traceBindings, traceDurableNamespace, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
});

function fakeNamespace() {
	const calls: { method: string; args: unknown[] }[] = [];
	const stub = {
		id: "stub-1",
		increment: async (by: number) => {
			calls.push({ method: "increment", args: [by] });
			return by + 1;
		},
		fetch: async () => new Response("ok"),
	};
	const namespace = {
		idFromName: (name: string) => `id:${name}`,
		get: (_id: string) => stub,
		getByName: (_name: string) => stub,
	};
	return { namespace, calls };
}

test("each stub method call becomes a do.call span with the binding and method", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	const { namespace } = fakeNamespace();
	const traced = traceDurableNamespace(namespace, "COUNTER");
	const stub = traced.getByName("main") as unknown as { increment(by: number): Promise<number> };
	expect(await stub.increment(2)).toBe(3);
	expect(records[0]).toMatchObject({
		name: "do.call",
		kind: "client",
		attributes: { "do.binding": "COUNTER", "rpc.method": "increment" },
	});
});

test("arguments are not recorded", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	const { namespace } = fakeNamespace();
	const stub = traceDurableNamespace(namespace, "COUNTER").getByName("main") as unknown as {
		increment(by: number): Promise<number>;
	};
	await stub.increment(424242);
	expect(JSON.stringify(records)).not.toContain("424242");
});

test("non-method properties and identifier helpers pass through", () => {
	const { namespace } = fakeNamespace();
	const traced = traceDurableNamespace(namespace, "COUNTER");
	expect(traced.idFromName("x")).toBe("id:x");
	const stub = traced.get("id") as unknown as { id: string };
	expect(stub.id).toBe("stub-1");
});

test("traceBindings wraps Durable Object namespaces by binding name", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	const { namespace } = fakeNamespace();
	const env = traceBindings({ COUNTER: namespace, FLAG: "on" });
	const stub = env.COUNTER.getByName("main") as unknown as { fetch(): Promise<Response> };
	await stub.fetch();
	expect(env.FLAG).toBe("on");
	expect(records[0]).toMatchObject({
		attributes: { "do.binding": "COUNTER", "rpc.method": "fetch" },
	});
});
