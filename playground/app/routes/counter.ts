import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const ns = c.env.DO_COUNTER;
	return { value: await ns.getByName("main").increment() };
});
