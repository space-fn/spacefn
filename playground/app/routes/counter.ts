import { defineHandler } from "spacefn";

export const POST = defineHandler(async (c) => {
	const ns = c.env.COUNTER as { getByName(name: string): { increment(by?: number): number } };
	return { value: ns.getByName("main").increment() };
});
