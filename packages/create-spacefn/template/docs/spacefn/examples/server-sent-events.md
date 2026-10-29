# Server-Sent Events

SpaceFn route handlers can return Hono's streaming response directly. Use
`streamSSE` from `hono/streaming` for route-local streams. For Durable Object
fan-out, use `createSSEHub` from `spacefn/sse`.

## Stream updates from a route

Create `app/routes/events.ts`:

```ts
import { streamSSE } from "hono/streaming";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) =>
	streamSSE(c, async (stream) => {
		let sequence = 0;
		stream.onAbort(() => {
			// Release subscriptions or other resources here.
		});

		while (true) {
			await stream.writeSSE({
				data: JSON.stringify({ sequence, at: new Date().toISOString() }),
				event: "update",
				id: String(sequence++),
			});
			await stream.sleep(1000);
		}
	}),
);
```

The route is available at `GET /events`. `streamSSE` sets the event-stream
response headers and formats each event. Use `event` for a named event, `data`
for its payload, and `id` when clients need an event cursor.

## Fan out through a Durable Object

Use a Durable Object when multiple requests need to publish to the same set of
connected clients. This replaces the direct `app/routes/events.ts` handler
above; keep the browser client below, which still connects to `/events`.

Create `app/durable-objects/feed.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { createSSEHub } from "spacefn/sse";

export class Feed extends DurableObject {
	private events = createSSEHub();

	async fetch(request: Request): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (request.method === "GET" && path === "/events") return this.events.subscribe();
		return new Response("Not found", { status: 404 });
	}

	publish(message: string): void {
		this.events.publish({ event: "update", data: JSON.stringify({ message }) });
	}
}
```

Create a route that attaches each browser stream to the same named object,
`DO_FEED` (derived from `Feed`):

```ts
// app/routes/events.ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) =>
	c.env.DO_FEED.getByName("global").fetch(new Request("https://feed/events")),
);
```

Publish an update through another route:

```ts
// app/routes/events/publish.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ message: string }>();
	if (typeof body.message !== "string") return c.json({ error: "invalid_message" }, 400);
	await c.env.DO_FEED.getByName("global").publish(body.message);
	return c.body(null, 202);
});
```

The publishing route must enforce authentication and authorization before
broadcasting in a real app. Use an authorized tenant or room ID instead of
`"global"` when streams must be isolated. The hub handles event framing and
removes closed or slow subscribers. Its subscriber set is in memory and does
not replay events to clients that reconnect.

## Consume it in the browser

```ts
const events = new EventSource("/events");

events.addEventListener("update", (event) => {
	const update = JSON.parse((event as MessageEvent<string>).data) as {
		sequence: number;
		at: string;
	};
	console.log(update.sequence, update.at);
});

events.onerror = () => {
	// EventSource reconnects automatically unless you close it.
};

// Call from the view's cleanup handler when it no longer needs the connection.
const stopListening = () => events.close();
```

SSE is one-way: use a separate HTTP request for client-to-server messages.
Browsers reconnect automatically, but event IDs alone do not retain or replay
events; implement replay using `Last-Event-ID` and your own event storage if
clients must catch up after disconnecting. For cross-origin streams, configure
CORS and credentials deliberately; `EventSource` cannot set arbitrary request
headers.
