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
