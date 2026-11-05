# WebSocket chat room

This example puts each room in a Durable Object. The page uses a small browser
entry to connect; the Worker route forwards the upgrade to the named room.

## Durable Object

Create `app/durable-objects/chat-room.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { acceptSocket, broadcast, readMessage } from "spacefn/ws";

export class ChatRoom extends DurableObject {
	async fetch(request: Request) {
		return acceptSocket(this.ctx, request, {
			allowedOrigins: ["https://chat.example.com"],
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
		const result = readMessage(raw, {
			maxSize: 64 * 1024,
			parse: (input) => {
				const value: unknown = JSON.parse(input);
				if (
					typeof value !== "object" ||
					value === null ||
					!("text" in value) ||
					typeof value.text !== "string" ||
					value.text.length > 2000
				) {
					throw new Error("Invalid chat message");
				}
				return { text: value.text };
			},
		});
		if (!result.ok) {
			ws.close(result.code, result.reason);
			return;
		}
		broadcast(this.ctx, result.value, { except: ws });
	}
}
```

`readMessage` bounds the message size and catches JSON parse or validation
errors. The room broadcasts only the validated `{ text }` shape.

## WebSocket route

Create `app/routes/ws/chat/[room].ts`:

```ts
import { defineHandler } from "spacefn/handler";
import { requireWebSocket } from "spacefn/ws";

export const GET = defineHandler((c) => {
	requireWebSocket(c.req.raw, ["https://chat.example.com"]);
	const room = c.req.param("room");
	return c.env.DO_CHAT_ROOM.getByName(room).fetch(c.req.raw);
});
```

Replace the example origin with the deployed site's origin. Authenticate the
request and authorize access to the requested room before forwarding the
upgrade. A room name is an identifier, not proof of permission.

## Page

Create `app/pages/chat/[room].page.ts`:

```ts
import { script } from "@space/client";
import { definePage, html } from "spacefn/pages";

export default definePage<{ room: string }>(
	({ room }) =>
		html`<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>Chat room</title>
				</head>
				<body>
					<main data-chat-room=${room}>
						<h1>Room: ${room}</h1>
						<p id="connection" role="status">Connecting…</p>
						<ul id="messages" aria-live="polite"></ul>
						<form id="send">
							<label>Message <input name="text" maxlength="2000" required /></label>
							<button>Send</button>
						</form>
					</main>
					${script("chat.ts")}
				</body>
			</html>`,
);
```

## Browser entry

Create `app/client/chat.ts`:

```ts
const root = document.querySelector<HTMLElement>("[data-chat-room]");
const form = document.querySelector<HTMLFormElement>("#send");
const messages = document.querySelector<HTMLUListElement>("#messages");
const status = document.querySelector<HTMLElement>("#connection");

if (root && form && messages && status) {
	const room = encodeURIComponent(root.dataset.chatRoom ?? "");
	const url = new URL(`/ws/chat/${room}`, window.location.href);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	const socket = new WebSocket(url);

	socket.addEventListener("open", () => {
		status.textContent = "Connected";
	});
	socket.addEventListener("close", () => {
		status.textContent = "Disconnected";
	});
	socket.addEventListener("message", (event: MessageEvent<string>) => {
		const value: unknown = JSON.parse(event.data);
		if (
			typeof value !== "object" ||
			value === null ||
			!("text" in value) ||
			typeof value.text !== "string"
		) {
			return;
		}
		const item = document.createElement("li");
		item.textContent = value.text;
		messages.append(item);
	});

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const data = new FormData(form);
		const text = String(data.get("text") ?? "").trim();
		if (!text || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ text }));
		const item = document.createElement("li");
		item.textContent = `You: ${text}`;
		messages.append(item);
		form.reset();
	});
}
```

The browser uses `textContent` rather than inserting message text as HTML.
For production, also validate and moderate messages on the server, authenticate
the socket, and add persistence if room history must survive disconnects.

See [Durable Objects](../directory-structure/durable-objects.md),
[WebSocket helpers](../api-reference/ws.md), and
[client bundles](../directory-structure/client.md).
