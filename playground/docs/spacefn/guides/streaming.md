# Streaming responses

Use Server-Sent Events (SSE) for one-way server-to-browser updates. A route
can stream ordinary events; a Datastar action can stream HTML patch events.
Use a Durable Object when many requests must publish to the same subscriber
set.

## Stream updates from a route

Create `app/routes/events.ts`:

```ts
import { streamSSE } from "hono/streaming";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) =>
	streamSSE(c, async (stream) => {
		let sequence = 0;
		stream.onAbort(() => {
			// Release timers or subscriptions if this stream owns any.
		});

		while (sequence < 10) {
			await stream.writeSSE({
				event: "update",
				id: String(sequence),
				data: JSON.stringify({ sequence, at: new Date().toISOString() }),
			});
			sequence += 1;
			await stream.sleep(1000);
		}
	}),
);
```

`streamSSE` sets the event-stream headers and formats events. A production
stream should have an intentional lifetime, heartbeat/idle policy, and
cleanup path; a route that waits forever consumes an open request for the
life of the connection.

## Stream a Datastar fragment

For an action that emits updates, send Datastar's patch event and keep the
markup escaped:

```ts
import { streamSSE } from "hono/streaming";
import { defineActions, html } from "spacefn/pages";

export const actions = defineActions({
	refresh: (c) =>
		streamSSE(c, async (stream) => {
			const fragment = html`<p id="status">Updated at ${new Date().toISOString()}</p>`;
			// Datastar reads each line of a patch from its own `elements` prefix.
			await stream.writeSSE({
				event: "datastar-patch-elements",
				data: fragment.value
					.split("\n")
					.map((line) => `elements ${line}`)
					.join("\n"),
			});
		}),
});
```

The page calls it using `@post('${actions.refresh.path()}')`. See the full
[Datastar SSE walkthrough](./datastar.md#stream-a-patch-with-sse) for the page
markup and import context.

## Fan out with a Durable Object

Use a Durable Object if multiple requests publish to the same live subscriber
set. The [SSE example](../examples/server-sent-events.md) includes the hub,
subscription route, publishing endpoint, and an `EventSource` browser client.
Use an authorized room or tenant identifier for the object name; a shared
global name would mix every user's events.

## Browser behavior and limits

- `EventSource` reconnects automatically, but event IDs do not store or replay
  events. Implement `Last-Event-ID` with durable event storage if clients
  must catch up.
- SSE is one-way. Use a separate HTTP request for client-to-server messages.
- Native `EventSource` cannot set arbitrary request headers. Use same-origin
  cookies or a different client when bearer headers are required.
- Check authorization before opening the stream and before publishing data.
- Close subscriptions and timers in the stream's abort handler.

See [Server-Sent Events](../examples/server-sent-events.md),
[WebSockets](../examples/chat-room.md), and
[Datastar](./datastar.md#stream-a-patch-with-sse).
