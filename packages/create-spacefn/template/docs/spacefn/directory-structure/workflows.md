# Workflows

`app/workflows/` holds one Workflow class per file. Each class is exported, bound, and added to the config automatically. The class itself is a plain Cloudflare `WorkflowEntrypoint` from `cloudflare:workers`; spacefn adds no runtime wrapper.

## Layout

```txt
app/workflows/
└── order-fulfillment.ts
```

Files starting with `_` and `*.test.*` files are ignored. The exported class name must match the file name in PascalCase (`order-fulfillment.ts` → `OrderFulfillment`). The binding name is `WF_` plus the uppercased snake-case of the class name, for example `OrderFulfillment` becomes `WF_ORDER_FULFILLMENT`.

## A Workflow

```ts
// app/workflows/order-fulfillment.ts
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export class OrderFulfillment extends WorkflowEntrypoint {
	async run(event: WorkflowEvent<{ orderId: string }>, step: WorkflowStep) {
		const validated = await step.do("validate", async () => {
			console.log("validating", event.payload.orderId);
			return true;
		});
		const charged = await step.do("charge", async () => {
			console.log("charging", event.payload.orderId);
			return validated;
		});
		return { orderId: event.payload.orderId, charged };
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
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export class FollowUp extends WorkflowEntrypoint {
	async run(event: WorkflowEvent<{ orderId: string; email: string }>, step: WorkflowStep) {
		await step.sleep("wait-three-days", "3 days");
		await step.do("send-email", async () => {
			// send the follow-up email
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
	const instance = await c.env.WORKFLOW_APPROVAL.get(body.instanceId);
	await instance.sendEvent({ type: "approval.received", payload: { approved: body.approved } });
	return { ok: true };
});
```

## Triggering a workflow

Create an instance from a route and read its result:

```ts
// app/routes/workflow.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId: string }>();
	const binding = c.env.WF_ORDER_FULFILLMENT;
	const instance = await binding.create({ params: { orderId: body.orderId } });
	await new Promise((r) => setTimeout(r, 500));
	const status = await instance.status();
	return { created: instance.id, status: status.status, output: status.output };
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
