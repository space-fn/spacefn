# WebSocket chat room

This example puts each room in a Durable Object. The page uses a small browser
entry to connect; the Worker route forwards the upgrade to the named room.

The Durable Object, route, page, and browser entry are all setup. What counts
as a valid chat message is a rule, so it lives in `modules/chat/`, and both the
server and the browser use the same function.

## The message rule

```ts
// modules/chat/message.ts

export const MAX_MESSAGE_LENGTH = 2000;

export interface ChatMessage {
	text: string;
}

/** Parses one message from the wire; throws when it is not a chat message. */
export function parseChatMessage(input: string): ChatMessage {
	const value: unknown = JSON.parse(input);
	if (
		typeof value !== "object" ||
		value === null ||
		!("text" in value) ||
		typeof value.text !== "string"
	) {
		throw new Error("Invalid chat message");
	}
	const text = value.text.trim();
	if (!text || text.length > MAX_MESSAGE_LENGTH) throw new Error("Invalid chat message");
	return { text };
}
```

```ts
// modules/chat/index.ts

export { MAX_MESSAGE_LENGTH, parseChatMessage, type ChatMessage } from "./message";
```

The module imports nothing from the server, so the browser bundle can import it
too.

## Durable Object

```ts
// app/durable-objects/chat-room.ts

import { parseChatMessage } from "@modules/chat";
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
		const result = readMessage(raw, { maxSize: 64 * 1024, parse: parseChatMessage });
		if (!result.ok) {
			ws.close(result.code, result.reason);
			return;
		}
		broadcast(this.ctx, result.value, { except: ws });
	}
}
```

`readMessage` bounds the message size and turns a parse error into a close
code. The room broadcasts only the parsed `{ text }` shape.

## WebSocket route

```ts
// app/routes/ws/chat/[room].ts

import { defineHandler } from "spacefn/handler";
import { requireWebSocket } from "spacefn/ws";

export const GET = defineHandler((c) => {
	requireWebSocket(c.req.raw, ["https://chat.example.com"]);
	const room = c.req.param("room");
	return c.env.DO_CHAT_ROOM.getByName(room ?? "").fetch(c.req.raw);
});
```

Replace the example origin with the deployed site's origin. Authenticate the
request and authorize access to the requested room before forwarding the
upgrade. A room name is an identifier, not proof of permission.

## Page

The loader passes the room from the URL to the page:

```ts
// app/pages/chat/[room].server.ts

import { defineLoader } from "spacefn/pages";

export const loader = defineLoader((c) => ({ room: c.req.param("room") ?? "" }));
```

```ts
// app/pages/chat/[room].page.ts

import { MAX_MESSAGE_LENGTH } from "@modules/chat";
import { script } from "@space/client";
import { definePage, html } from "spacefn/pages";

import type { loader } from "./[room].server";

export default definePage<typeof loader>(
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
							<label>Message <input name="text" maxlength=${MAX_MESSAGE_LENGTH} required /></label>
							<button>Send</button>
						</form>
					</main>
					${script("chat.ts")}
				</body>
			</html>`,
);
```

## Browser entry

The entry wires the DOM and the socket. It parses incoming messages with the
same `parseChatMessage` the room uses, and drops anything that fails:

```ts
// app/client/chat.ts

import { parseChatMessage } from "@modules/chat";

const root = document.querySelector<HTMLElement>("[data-chat-room]");
const form = document.querySelector<HTMLFormElement>("#send");
const messages = document.querySelector<HTMLUListElement>("#messages");
const status = document.querySelector<HTMLElement>("#connection");

function show(text: string) {
	const item = document.createElement("li");
	item.textContent = text;
	messages?.append(item);
}

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
		try {
			show(parseChatMessage(event.data).text);
		} catch {
			// not a chat message: ignore it
		}
	});

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = String(new FormData(form).get("text") ?? "").trim();
		if (!text || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ text }));
		show(`You: ${text}`);
		form.reset();
	});
}
```

The browser uses `textContent` rather than inserting message text as HTML.
For production, also moderate messages on the server, authenticate the socket,
and add persistence if room history must survive disconnects.

See [modules](../directory-structure/modules.md),
[Durable Objects](../directory-structure/durable-objects.md),
[WebSocket helpers](../api-reference/ws.md), and
[client bundles](../directory-structure/client.md).
