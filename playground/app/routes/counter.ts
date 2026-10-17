import { defineHandler } from "spacefn";

import type { Counter } from "../../durable-objects/counter";

export const POST = defineHandler(async (c) => {
	const ns = c.env.COUNTER as DurableObjectNamespace<Counter>;
	const value = await ns.getByName("main").increment();
	return { value };
});
