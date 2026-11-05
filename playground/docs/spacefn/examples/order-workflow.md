# Order fulfillment workflow

Use a Cloudflare Workflow when a job spans steps, may take time, and must
resume after a failure or restart. Each named `step.do` result is checkpointed;
completed steps are not repeated when a later step retries.

## Workflow class

Create `app/workflows/order-fulfillment.ts`:

```ts
import { chargeOrder, markOrderPaid, validateOrder } from "@modules/orders";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

type OrderParams = { orderId: string };

export class OrderFulfillment extends WorkflowEntrypoint {
	async run(event: WorkflowEvent<OrderParams>, step: WorkflowStep) {
		const order = await step.do(
			"validate-order",
			{ retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } },
			async () => {
				const value = await validateOrder(event.payload.orderId);
				if (!value) throw new NonRetryableError("Order is missing or cannot be fulfilled");
				return value;
			},
		);

		const charge = await step.do(
			"charge-payment",
			{ retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } },
			async () => chargeOrder(order),
		);

		await step.do("mark-paid", async () => markOrderPaid(order.id, charge.id));
		return { orderId: order.id, chargeId: charge.id, status: "paid" as const };
	}
}
```

`validateOrder`, `chargeOrder`, and `markOrderPaid` are app-owned. Use
idempotency keys with external payment providers because a provider call may
succeed even if the workflow cannot record its step result. Throw
`NonRetryableError` only for permanent failures; transient failures should
throw a normal error so the configured retry policy can run.

## Start the workflow

Create `app/routes/orders/fulfill.ts`:

```ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId?: unknown }>();
	if (typeof body.orderId !== "string" || body.orderId.length === 0) {
		return c.json({ error: "order_id_required" }, 400);
	}

	const instance = await c.env.WF_ORDER_FULFILLMENT.create({
		params: { orderId: body.orderId },
	});
	return c.json({ instanceId: instance.id }, 202);
});
```

Spacefn derives the `WF_ORDER_FULFILLMENT` binding from
`OrderFulfillment`; keep `export * from "@space/exports"` in
`app/entry.ts` so the Worker exports the class.

## Check status

Create `app/routes/orders/workflows/[id].ts`:

```ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	const instance = await c.env.WF_ORDER_FULFILLMENT.get(c.req.param("id"));
	const status = await instance.status();
	return {
		id: instance.id,
		status: status.status,
		output: status.output,
	};
});
```

Protect status endpoints so users can only inspect workflows they are
authorized to see. The Workflow binding itself is not an authorization
boundary.

See [workflow conventions](../directory-structure/workflows.md),
[Workflow API](../api-reference/workflows.md), and the
[scheduled job example](./scheduled-job.md) for shorter recurring work.
