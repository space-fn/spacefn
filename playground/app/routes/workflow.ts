import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId: string }>();
	const binding = c.env.WF_ORDER_FULFILMENT;
	const instance = await binding.create({ params: { orderId: body.orderId } });
	await new Promise((r) => setTimeout(r, 500));
	return { created: instance.id };
});
