import { DurableObject } from "cloudflare:workers";
import { acceptSocket, broadcast, readMessage } from "spacefn/ws";

export class ChatRoom extends DurableObject {
	async fetch(request: Request) {
		return acceptSocket(this.ctx, request);
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
		const r = readMessage(raw, { maxSize: 64 * 1024 });
		if (!r.ok) {
			ws.close(r.code, r.reason);
			return;
		}
		broadcast(this.ctx, r.value, { except: ws });
	}
}
