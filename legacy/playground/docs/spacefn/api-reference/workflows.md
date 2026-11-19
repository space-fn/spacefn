# Workflows API (`spacefn/workflows`)

Workflow classes under `app/workflows/` are registered as Worker exports and
bindings. See the [workflow convention](../directory-structure/workflows.md)
for authoring a workflow class.

| API                                  | Behavior                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `workflowsConfig(files, workerName)` | Builds the `cf/config` `exports` and `env` entries for the discovered files. |
| `workflowClassName(file)`            | Converts a filename such as `order-fulfillment.ts` to `OrderFulfillment`.    |
| `workflowBinding(file)`              | Derives the `WF_...` environment binding name from a filename.               |
| `workflowName(file)`                 | Removes the source extension to derive the Cloudflare workflow name.         |

The Vite plugin invokes `workflowsConfig` and creates the Worker bindings
automatically. These helpers are exported for custom configuration tooling;
application code usually uses the generated binding types from `.space/`.

## Start a workflow

```ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ orderId?: unknown }>();
	if (typeof body.orderId !== "string" || body.orderId.length === 0) {
		return c.json({ error: "order_id_required" }, 400);
	}
	const orderId = body.orderId;
	const instance = await c.env.WF_ORDER_FULFILLMENT.create({ params: { orderId } });
	return c.json({ instanceId: instance.id }, 202);
});
```

`OrderFulfillment` in `app/workflows/order-fulfillment.ts` produces the
`WF_ORDER_FULFILLMENT` binding. The class uses Cloudflare's `WorkflowEntrypoint`
and `step.do`; spacefn handles discovery and config wiring, not workflow
semantics. See the [order workflow example](../examples/order-workflow.md)
and [workflow convention](../directory-structure/workflows.md).
