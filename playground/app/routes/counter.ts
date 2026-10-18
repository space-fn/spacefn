import { defineHandler } from "spacefn";
import { unwrapDurableObject } from "spacefn/durable-objects";

export const POST = defineHandler(async (c) => {
	const ns = unwrapDurableObject<{ getByName(name: string): { increment(by?: number): number } }>(
		c.env.COUNTER,
	);
	return { value: ns.getByName("main").increment() };
});
