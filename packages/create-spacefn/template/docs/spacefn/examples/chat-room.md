# WebSocket chat room

A Durable Object room using `WebSocketRoom`.

```ts
import { WebSocketRoom } from "spacefn/ws";

export class ChatRoom extends WebSocketRoom {
  async onMessage(socket, raw) {
    await super.onMessage(socket, raw);
    this.broadcast({ type: "message", text: raw }, { except: socket });
  }
}
```

Route upgrade:

```ts
import { requireWebSocket } from "spacefn/ws";

export const GET = (c) => {
  requireWebSocket(c.req.raw, ["https://example.com"]);
  const id = c.env.DO_CHAT_ROOM.idFromName("lobby");
  return c.env.DO_CHAT_ROOM.get(id).fetch(c.req.raw);
};
```

See [durable objects](../directory-structure/durable-objects.md).
