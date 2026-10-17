import { defineHandler } from "spacefn";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId: string }>();
	const binding = (
		c.env.WORKFLOW_ORDERFULFILLMENT as {
			binding: { create(options: { params: { orderId: string } }): Promise<{ id: string }> };
		}
	).binding;
	const instance = await binding.create({ params: { orderId: body.orderId } });
	await new Promise((r) => setTimeout(r, 500));
	return { created: instance.id };
});
