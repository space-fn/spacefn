# WebSocket helpers (`spacefn/ws`)

```ts
import { DurableObject } from "cloudflare:workers";
import { acceptSocket, attachmentOf, broadcast, readMessage } from "spacefn/ws";

export class ChatRoom extends DurableObject {
	async fetch(request: Request) {
		return acceptSocket(this.ctx, request, {
			allowedOrigins: ["https://app.example.com"],
			attachment: { joinedAt: Date.now() },
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const text = typeof message === "string" ? message : new TextDecoder().decode(message);
		const result = readMessage(text, {
			maxSize: 64 * 1024,
			parse: (raw) => JSON.parse(raw) as { text: string },
		});
		if (!result.ok) return ws.close(result.code, result.reason);
		const attachment = attachmentOf(ws);
		broadcast(this.ctx, { ...result.value, joinedAt: attachment?.joinedAt }, { except: ws });
	}
}
```

- `acceptSocket` validates the upgrade, optionally checks the origin, and can persist a serializable attachment.
- `readMessage` bounds message size and catches parser errors; validate the parsed shape before using it.
- `broadcast` serializes non-string messages as JSON and can omit the sender.

- `acceptSocket(ctx, request, options?)`: validates the upgrade, accepts the socket via the hibernation API, stores an attachment, returns the 101 response. Throws `SpaceError` 426 (not an upgrade) or 403 (bad origin).
- `broadcast(ctx, message, { except })`: sends to every socket except `except`.
- `readMessage(raw, { maxSize, parse })`: returns `{ ok, value }` or `{ ok: false, code, reason }`. Code 1009 for oversize, 1008 when `parse` throws.
- `requireWebSocket(request, origins?)`: throws `SpaceError` 426/403.

Close codes: 1008 (policy violation, bad message), 1009 (message too big).
