# Order fulfillment workflow

Use a Cloudflare Workflow when a job spans steps, may take time, and must
resume after a failure or restart. Each named `step.do` result is checkpointed;
completed steps are not repeated when a later step retries.

The workflow class is setup: it names the steps and their retry policies,
which Cloudflare needs to checkpoint them. What each step does lives in
`modules/orders/`, and the payment provider is a `lib/` client.

## The orders module

```ts
// modules/orders/fulfil.ts

import type { PaymentClient } from "@lib/payments";
import { findOrder, setOrderPaid } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import type { DbReader } from "spacefn/db";

export async function validateOrder(db: DbReader, orderId: string) {
	const order = await findOrder(db, { id: orderId });
	if (!order) throw new AppError("not_found", "No such order.");
	if (order.status !== "pending") throw new AppError("conflict", "The order is not pending.");
	return order;
}

export function chargeOrder(payments: PaymentClient, order: { id: string; totalCents: number }) {
	// The order id is the idempotency key: a retried step cannot charge twice.
	return payments.charge({ amountCents: order.totalCents, idempotencyKey: `order-${order.id}` });
}

export function markOrderPaid(db: DbReader, orderId: string, chargeId: string) {
	return setOrderPaid(db, { id: orderId, chargeId });
}
```

`findOrder` and `setOrderPaid` are generated queries. `PaymentClient` is the
interface your `lib/payments.ts` client exports, built from an API key.

## Workflow class

```ts
// app/workflows/order-fulfillment.ts

import { mainDb } from "@app/db/main_db";
import { createPaymentClient } from "@lib/payments";
import { chargeOrder, markOrderPaid, validateOrder } from "@modules/orders";
import { AppError } from "@utils/errors";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

type Env = { DB: D1Database; PAYMENTS_KEY: string };
type OrderParams = { orderId: string };

export class OrderFulfillment extends WorkflowEntrypoint<Env> {
	async run(event: WorkflowEvent<OrderParams>, step: WorkflowStep) {
		const db = await mainDb(this.env.DB);
		const payments = createPaymentClient({ apiKey: this.env.PAYMENTS_KEY });

		const order = await step.do(
			"validate-order",
			{ retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } },
			async () => {
				try {
					return await validateOrder(db, event.payload.orderId);
				} catch (error) {
					// A missing or settled order will not fix itself: stop instead of retrying.
					if (error instanceof AppError) throw new NonRetryableError(error.message);
					throw error;
				}
			},
		);

		const charge = await step.do(
			"charge-payment",
			{ retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } },
			() => chargeOrder(payments, order),
		);

		await step.do("mark-paid", () => markOrderPaid(db, order.id, charge.id));
		return { orderId: order.id, chargeId: charge.id, status: "paid" as const };
	}
}
```

The workflow translates the module's `AppError` into Cloudflare's
`NonRetryableError`, because the retry policy is the workflow's concern and
the module knows nothing about workflows. Transient failures throw a normal
error, so the configured retries run. Use idempotency keys with external
payment providers, because a provider call may succeed even if the workflow
cannot record its step result.

## Start the workflow

The route checks the request's shape and starts the instance:

```ts
// app/routes/orders/fulfill.ts

import { AppError } from "@utils/errors";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId?: unknown }>();
	if (typeof body.orderId !== "string" || body.orderId.length === 0) {
		throw new AppError("invalid", "Send an orderId.", "order_id_required");
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

The status route reads the instance:

```ts
// app/routes/orders/workflows/[id].ts

import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	const instance = await c.env.WF_ORDER_FULFILLMENT.get(c.req.param("id") ?? "");
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
