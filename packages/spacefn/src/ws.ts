import { SpaceError } from "./errors";

export interface WebSocketAttachment {
	[key: string]: unknown;
}

export interface AcceptSocketOptions {
	attachment?: WebSocketAttachment;
	allowedOrigins?: string[];
}

/**
 * Validate and accept a WebSocket upgrade. Returns the 101 Response.
 * Stores `attachment` on the accepted socket via serializeAttachment.
 */
export function acceptSocket(
	ctx: { acceptWebSocket: (ws: WebSocket) => void },
	request: Request,
	options: AcceptSocketOptions = {},
): Response {
	requireWebSocket(request, options.allowedOrigins);
	const Pair = (globalThis as { WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket } })
		.WebSocketPair;
	if (!Pair) {
		throw new SpaceError("WS_NO_PAIR", "WebSocketPair is not available in this runtime", {
			status: 500,
			hint: "Run this code in a Workers runtime.",
		});
	}
	const pair = new Pair();
	ctx.acceptWebSocket(pair[1]);
	if (options.attachment) {
		try {
			pair[1].serializeAttachment(options.attachment);
		} catch {
			// runtime may not support attachments; ignore
		}
	}
	return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & {
		webSocket: WebSocket;
	});
}

export function broadcast(
	ctx: { getWebSockets: () => WebSocket[] },
	message: unknown,
	options: { except?: WebSocket } = {},
): void {
	const payload = typeof message === "string" ? message : JSON.stringify(message);
	for (const ws of ctx.getWebSockets()) {
		if (ws === options.except) continue;
		try {
			ws.send(payload);
		} catch {
			// socket gone; runtime cleans up
		}
	}
}

export interface ReadMessageOptions<T> {
	maxSize?: number;
	parse?: (raw: string) => T;
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; code: number; reason: string };

export function readMessage<T = string>(
	raw: string,
	options: ReadMessageOptions<T> = {},
): ReadResult<T> {
	const max = options.maxSize ?? 64 * 1024;
	if (raw.length > max) {
		return { ok: false, code: 1009, reason: "message too large" };
	}
	if (options.parse) {
		try {
			return { ok: true, value: options.parse(raw) };
		} catch (error) {
			return {
				ok: false,
				code: 1008,
				reason: error instanceof Error ? error.message : "invalid message",
			};
		}
	}
	return { ok: true, value: raw as unknown as T };
}

export function requireWebSocket(request: Request, allowedOrigins?: string[]): void {
	if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
		throw new SpaceError("WS_NOT_UPGRADE", "Expected a WebSocket upgrade request", {
			status: 426,
			hint: "Use fetch with Upgrade: websocket.",
		});
	}
	if (allowedOrigins && allowedOrigins.length) {
		const origin = request.headers.get("Origin");
		if (!origin || !allowedOrigins.includes(origin)) {
			throw new SpaceError("WS_BAD_ORIGIN", `Origin ${origin ?? "(none)"} is not allowed`, {
				status: 403,
				hint: "Add the origin to the allowed list.",
			});
		}
	}
}

export function attachmentOf(ws: WebSocket): WebSocketAttachment | null {
	try {
		return (ws.deserializeAttachment?.() as WebSocketAttachment) ?? null;
	} catch {
		return null;
	}
}
