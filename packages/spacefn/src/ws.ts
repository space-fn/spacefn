import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import { SpaceError } from "./errors";

export interface SseOptions {
	/** Heartbeat interval in ms. Default 15000. Set 0 to disable. */
	heartbeatMs?: number;
}

/** Stream Server-Sent Events. The callback receives a sender. */
export function sse(
	c: Context,
	run: (send: (event: string, data: string) => Promise<void>) => Promise<void>,
	options: SseOptions = {},
): Response {
	const heartbeatMs = options.heartbeatMs ?? 15000;
	return streamSSE(c, async (stream) => {
		let timer: ReturnType<typeof setInterval> | undefined;
		if (heartbeatMs > 0) {
			timer = setInterval(() => {
				stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
			}, heartbeatMs);
		}
		const send = async (event: string, data: string) => {
			await stream.writeSSE({ event, data });
		};
		try {
			await run(send);
		} finally {
			if (timer) clearInterval(timer);
		}
	}) as unknown as Response;
}

export interface WebSocketRoomOptions<TMessage = unknown> {
	/** Parse a raw message. Throw to close the socket with a policy violation. */
	parse?: (raw: string) => TMessage;
	/** Maximum message size in bytes. Default 64 KiB. */
	maxMessageSize?: number;
}

/** Minimal base for a Durable Object room. Users extend and override hooks. */
export class WebSocketRoom<TMessage = unknown> {
	protected readonly sockets = new Set<WebSocket>();

	constructor(protected readonly options: WebSocketRoomOptions<TMessage> = {}) {}

	/** Accept a socket into the room. */
	join(socket: WebSocket): void {
		this.sockets.add(socket);
		socket.addEventListener("close", () => this.sockets.delete(socket));
		socket.addEventListener("error", () => this.sockets.delete(socket));
	}

	/** Remove a socket. */
	leave(socket: WebSocket): void {
		this.sockets.delete(socket);
		try {
			socket.close();
		} catch {
			// already closed
		}
	}

	/** Send to every socket except `except`. */
	broadcast(message: unknown, options: { except?: WebSocket } = {}): void {
		const payload = typeof message === "string" ? message : JSON.stringify(message);
		for (const socket of this.sockets) {
			if (socket === options.except) continue;
			try {
				socket.send(payload);
			} catch {
				this.sockets.delete(socket);
			}
		}
	}

	/** Handle an incoming raw message. Override in subclass. */
	async onMessage(socket: WebSocket, raw: string): Promise<void> {
		const max = this.options.maxMessageSize ?? 64 * 1024;
		if (raw.length > max) {
			socket.close(1009, "message too large");
			return;
		}
		let parsed: TMessage = raw as unknown as TMessage;
		if (this.options.parse) {
			try {
				parsed = this.options.parse(raw);
			} catch (error) {
				socket.close(1008, error instanceof Error ? error.message : "invalid message");
				return;
			}
		}
		void parsed;
	}

	/** Number of connected sockets. */
	get size(): number {
		return this.sockets.size;
	}
}

/** Guard: ensure the request is a WebSocket upgrade with an allowed origin. */
export function requireWebSocket(req: Request, allowedOrigins?: string[]): void {
	if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
		throw new SpaceError("WS_NOT_UPGRADE", "Expected a WebSocket upgrade request", {
			hint: "Use fetch with Upgrade: websocket.",
		});
	}
	if (allowedOrigins && allowedOrigins.length) {
		const origin = req.headers.get("Origin");
		if (!origin || !allowedOrigins.includes(origin)) {
			throw new SpaceError("WS_BAD_ORIGIN", `Origin ${origin ?? "(none)"} is not allowed`, {
				hint: "Add the origin to the allowed list.",
			});
		}
	}
}
