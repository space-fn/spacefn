# Streaming and Server-Sent Events

Route handlers can return a streaming `Response`, and `defineHandler` passes it
through unchanged. For a route-local stream, use Hono's `streamSSE` from
`hono/streaming`:

```ts
import { streamSSE } from "hono/streaming";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) =>
	streamSSE(c, async (stream) => {
		stream.onAbort(() => {
			// Release subscriptions or other resources here.
		});
		await stream.writeSSE({
			event: "update",
			data: JSON.stringify({ at: new Date().toISOString() }),
		});
	}),
);
```

`streamSSE(context, callback)` returns the response and sets the SSE content
type. The stream supports `writeSSE({ data, event?, id?, retry? })`,
`sleep(milliseconds)`, and `onAbort(callback)`. The callback can keep writing
events while the connection is open; use `onAbort` to release subscriptions or
other resources when the client disconnects.

For Durable Object fan-out, `spacefn/sse` provides `createSSEHub()`:

| API                                      | Behavior                                                        |
| ---------------------------------------- | --------------------------------------------------------------- |
| `createSSEHub(): SSEHub`                 | Creates an in-memory subscriber hub.                            |
| `SSEHub.subscribe(): Response`           | Opens an SSE response and removes the subscriber on disconnect. |
| `SSEHub.publish(event: ServerSentEvent)` | Encodes and sends an event to connected subscribers.            |

```ts
import { createSSEHub } from "spacefn/sse";

const events = createSSEHub();
const response = events.subscribe();
events.publish({ event: "update", data: JSON.stringify({ message: "hello" }) });
```

`ServerSentEvent` accepts `data: string` and optional `event`, `id`, and
`retry` fields. Each subscriber buffers up to 16 event chunks; publishing when
that buffer is full disconnects the slow subscriber. The hub is in-memory
only, so it does not persist or replay events after disconnects or object
restarts.
Use the [Durable Object example](../examples/server-sent-events.md) for a
complete route and publisher.

SSE is one-way. Browsers reconnect automatically, but event IDs do not provide
replay by themselves; persist events and handle `Last-Event-ID` if clients
need to catch up. For a complete route and browser `EventSource` example, see
[Server-Sent Events](../examples/server-sent-events.md).
