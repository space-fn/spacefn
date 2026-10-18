import { defineHandler } from "spacefn";

export const POST = defineHandler(async (c) => {
	const ns = c.env.COUNTER;
	return { value: await ns.getByName("main").increment() };
});
