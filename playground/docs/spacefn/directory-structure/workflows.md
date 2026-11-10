# Workflows

`app/workflows/` holds one Workflow class per file. Each class is exported, bound, and added to the config automatically. The class itself is a plain Cloudflare `WorkflowEntrypoint` from `cloudflare:workers`; spacefn adds no runtime wrapper.

## Layout

```txt
app/workflows/
└── order-fulfillment.ts
```

Files starting with `_` and `*.test.*` files are ignored. The exported class name must match the file name in PascalCase (`order-fulfillment.ts` → `OrderFulfillment`). The binding name is `WF_` plus the uppercased snake-case of the class name, for example `OrderFulfillment` becomes `WF_ORDER_FULFILLMENT`.

## A Workflow

The class is setup: it names the steps, their retries, and their order, which Cloudflare needs to checkpoint them. Each step calls a module function that does the work (see [modules](./modules.md)).

```ts
// app/workflows/order-fulfillment.ts

import { mainDb } from "@app/db/main_db";
import { chargeOrder, validateOrder } from "@modules/orders";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

type Env = { DB: D1Database };

export class OrderFulfillment extends WorkflowEntrypoint<Env> {
	async run(event: WorkflowEvent<{ orderId: string }>, step: WorkflowStep) {
		const db = await mainDb(this.env.DB);
		const order = await step.do("validate", () => validateOrder(db, event.payload.orderId));
		const charge = await step.do("charge", () => chargeOrder(db, order));
		return { orderId: order.id, chargeId: charge.id };
	}
}
```

`step.do` runs a named step. Its return value is cached, so a retried run skips completed steps. `event.payload` is the input passed at creation time.

## Retries, timeouts, and backoff

`step.do` accepts a config object for retries and a timeout:

```ts
const validated = await step.do(
	"validate",
	{ retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "1 minute" },
	async (ctx) => {
		// ctx.attempt, ctx.step.name
		return true;
	},
);
```

Throw `NonRetryableError` (from `cloudflare:workflows`) to fail immediately without retrying. Add a `rollback` handler in the config to undo a step on failure.

## Delayed work: sleep

```ts
// app/workflows/follow-up.ts

import { createEmailClient } from "@lib/email";
import { followUpEmail } from "@modules/orders";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

type Env = { MAIL_API_KEY: string };

export class FollowUp extends WorkflowEntrypoint<Env> {
	async run(event: WorkflowEvent<{ orderId: string; email: string }>, step: WorkflowStep) {
		await step.sleep("wait-three-days", "3 days");
		await step.do("send-email", async () => {
			const mail = createEmailClient({ apiKey: this.env.MAIL_API_KEY });
			await mail.send(followUpEmail(event.payload));
			return true;
		});
		return { sent: true };
	}
}
```

`step.sleepUntil(name, date)` waits until an absolute time instead.

## Human in the loop: waitForEvent

A workflow can pause for an external signal:

```ts
// app/workflows/approval.ts

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export class Approval extends WorkflowEntrypoint {
	async run(event: WorkflowEvent<{ requestId: string }>, step: WorkflowStep) {
		const decision = await step.waitForEvent<{ approved: boolean }>("decision", {
			type: "approval.received",
			timeout: "2 days",
		});
		if (!decision.payload.approved) return { status: "rejected" };
		await step.do("ship", async () => true);
		return { status: "shipped" };
	}
}
```

Send the signal from a route:

```ts
// app/routes/approve.ts

import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ instanceId: string; approved: boolean }>();
	const instance = await c.env.WF_APPROVAL.get(body.instanceId);
	await instance.sendEvent({ type: "approval.received", payload: { approved: body.approved } });
	return { ok: true };
});
```

## Triggering a workflow

Create an instance from a route, and read its status from another:

```ts
// app/routes/workflow.ts

import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId: string }>();
	const instance = await c.env.WF_ORDER_FULFILLMENT.create({ params: { orderId: body.orderId } });
	return c.json({ instanceId: instance.id }, 202);
});
```

```ts
// app/routes/workflow/[id].ts

import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	const status = await (await c.env.WF_ORDER_FULFILLMENT.get(c.req.param("id") ?? "")).status();
	return { status: status.status, output: status.output };
});
```

`create({ params })` sets `event.payload`. `status()` returns `status` (`queued`, `running`, `complete`, `errored`, ...) and `output` (the value returned from `run`). Instances can also be paused, resumed, terminated, restarted, and subscribed to.

## Notes

- The workflow class must be exported from the Worker module. `app/entry.ts` already does this via `export * from "@space/exports"`. Removing that line breaks the binding.
- `limits`, `concurrency`, `schedules` and `defaultRetention` are Cloudflare Workflow options, but spacefn's folder convention does not expose them. Set them in `cloudflare.config.ts` directly if you need them.
- The binding type in `.space/bindings.d.ts` is the plain `Workflow` (params typed as `unknown`) because bindings are added through the Vite plugin's runtime config. For typed params, declare the binding in `cloudflare.config.ts` and let `cf/config` infer them.

## How the binding is wired

You never declare a Workflow in `cloudflare.config.ts` by hand. The `space()` Vite plugin's `config` callback scans `app/workflows/` and calls `workflowsConfig(files, worker.name)`, which adds two entries to the Worker config:

The generated config looks like this:

```ts
exports: {
	OrderFulfillment: exports.workflow({ name: "order-fulfillment" }),
},
env: {
	WF_ORDER_FULFILLMENT: bindings.workflow({ name: "order-fulfillment", worker: worker.name, exportName: "OrderFulfillment" }),
},
```

`worker.name` comes from `cloudflare.config.ts` (`defineConfig({ worker: { name: "..." } })`). The class reaches Cloudflare through `app/entry.ts` via `export * from "@space/exports"`. Remove that re-export and the binding breaks.

This injection runs in both dev and production. The `space()` Vite plugin's `config` callback runs whenever Vite resolves the Worker config — `vp dev` and `vp build` alike — so the same `WF_*` binding and `OrderFulfillment` export land in `.cloudflare/output/v0/workers/default/worker.config.json` and are deployed with the Worker. Adding or removing a file under `app/workflows/` changes the deployed config on the next build.

`limits`, `concurrency`, `schedules` and `defaultRetention` are Cloudflare Workflow options, but the folder convention does not expose them. Set them in `cloudflare.config.ts` directly if you need them.
