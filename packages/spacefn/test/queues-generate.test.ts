import { expect, test } from "vitest";

import { generateWorkerSource } from "../src/entry";
import { generateQueuesSource, producerName } from "../src/queues/generate";
import { unwrapQueueBody, wrapQueueBody } from "../src/trace/envelope";

test("names producers in camelCase", () => {
	expect(producerName("emails.ts")).toBe("emails");
	expect(producerName("order-jobs.ts")).toBe("orderJobs");
});

test("rejects file names that cannot be identifiers", () => {
	expect(() => producerName("1st.ts")).toThrow("cannot be turned into a producer name");
});

test("generates a typed producer per queue file", () => {
	const source = generateQueuesSource(["emails.ts", "order-jobs.ts"]);
	expect(source).toContain('import type handler0 from "../queues/emails";');
	expect(source).toContain('emails: queueProducer<QueueBodyOf<typeof handler0>>("QUEUE_EMAILS"),');
	expect(source).toContain(
		'orderJobs: queueProducer<QueueBodyOf<typeof handler1>>("QUEUE_ORDER_JOBS"),',
	);
});

test("generates an empty producer map without queues", () => {
	expect(generateQueuesSource([])).toContain("export const queues = {\n} as const;");
});

test("the worker fetch runs the request with its bindings", () => {
	expect(generateWorkerSource({})).toContain(
		"runWithBindings(bindings, () => app.fetch(request, bindings, ctx))",
	);
});

test("envelopes round-trip the publishing trace and pass plain bodies through", () => {
	const context = { traceId: "a".repeat(32), spanId: "b".repeat(16) };
	const wrapped = wrapQueueBody({ to: "x" }, context);
	expect(unwrapQueueBody(wrapped)).toEqual({ body: { to: "x" }, context });
	expect(unwrapQueueBody({ plain: true })).toEqual({ body: { plain: true } });
	expect(unwrapQueueBody("text")).toEqual({ body: "text" });
});
