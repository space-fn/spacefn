/** Minimal in-memory stand-ins for the Worker bindings, enough for Node tests. */
export const fakeKv = () => {
	const values = new Map<string, { value: string; ttl?: number }>();
	const kv = {
		get: async (key: string) => values.get(key)?.value ?? null,
		put: async (key: string, value: string, options?: { expirationTtl?: number }) =>
			void values.set(key, { value, ttl: options?.expirationTtl }),
		delete: async (key: string) => void values.delete(key),
	};
	return { kv: kv as unknown as KVNamespace, values };
};

export const fakeQueue = () => {
	const sent: { body: unknown; options?: { delaySeconds?: number } }[] = [];
	const queue = {
		send: async (body: unknown, options?: { delaySeconds?: number }) =>
			void sent.push({ body, options }),
	};
	return { queue: queue as unknown as Queue, sent };
};

export const fakeContext = () => {
	const pending: Promise<unknown>[] = [];
	const ctx = {
		waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
		passThroughOnException() {},
		props: {},
	};
	return { ctx: ctx as unknown as ExecutionContext, settle: () => Promise.all(pending) };
};

export const fakeMessage = (id: string, body: unknown) => {
	const settled: string[] = [];
	const message = {
		id,
		body,
		attempts: 1,
		timestamp: new Date(),
		ack: () => void settled.push("ack"),
		retry: (options?: { delaySeconds?: number }) =>
			void settled.push(`retry${options?.delaySeconds ? ` ${options.delaySeconds}s` : ""}`),
	};
	return { message: message as unknown as Message, settled };
};
