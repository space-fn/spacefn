import { Cause, Effect, Layer, Queue, Stream } from "effect";
import { Bus, BusError } from "spacefn";

import { binding, type WorkerEnv } from "./bindings.ts";

/** The Durable Object namespace `Bus` uses; the entry exports {@link SpaceBus} for it. */
export const BUS_BINDING = "SPACE_BUS";

/**
 * One topic of the Bus: subscribers hold a WebSocket to it, and a publish is
 * sent to each of them. It uses the hibernation API, so an idle topic with open
 * subscriptions costs no duration.
 */
export class SpaceBus {
	readonly #ctx: DurableObjectState;

	constructor(ctx: DurableObjectState, _env: unknown) {
		this.#ctx = ctx;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("upgrade") === "websocket") {
			const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
			this.#ctx.acceptWebSocket(server);
			return new Response(null, { status: 101, webSocket: client });
		}
		if (request.method !== "POST") return new Response(null, { status: 405 });
		const message = await request.text();
		for (const socket of this.#ctx.getWebSockets()) {
			try {
				socket.send(message);
			} catch {
				// Already closing; webSocketClose cleans it up.
			}
		}
		return new Response(null, { status: 204 });
	}

	webSocketMessage(): void {
		// Subscribers only listen.
	}

	webSocketClose(socket: WebSocket, code: number, reason: string): void {
		socket.close(code, reason);
	}
}

const topicStub = (env: WorkerEnv, topic: string) => {
	const namespace = binding<DurableObjectNamespace>(env, BUS_BINDING, "Durable Object");
	return namespace.get(namespace.idFromName(topic));
};

/** `Bus` on {@link SpaceBus}: one object per topic, so topics scale apart. */
export const busLayer = (env: WorkerEnv): Layer.Layer<Bus> =>
	Layer.succeed(Bus, {
		publish: (topic, message) =>
			Effect.tryPromise({
				try: async () => {
					const response = await topicStub(env, topic).fetch("https://bus/publish", {
						method: "POST",
						body: message,
					});
					if (!response.ok) throw new Error(`The Bus answered ${response.status}`);
				},
				catch: (cause) => new BusError({ operation: "publish", topic, cause }),
			}),
		subscribe: (topic) =>
			Effect.gen(function* () {
				const fail = (cause: unknown) => new BusError({ operation: "subscribe", topic, cause });
				const messages = yield* Queue.unbounded<string, BusError | Cause.Done>();
				const socket = yield* Effect.acquireRelease(
					Effect.tryPromise({
						try: async () => {
							const response = await topicStub(env, topic).fetch("https://bus/subscribe", {
								headers: { upgrade: "websocket" },
							});
							if (!response.webSocket) throw new Error(`The Bus answered ${response.status}`);
							return response.webSocket;
						},
						catch: fail,
					}),
					(socket) => Effect.sync(() => socket.close(1000)),
				);
				// Listen before accepting, and buffer, so nothing published after this returns is lost.
				socket.addEventListener("message", (event) => {
					Queue.offerUnsafe(messages, typeof event.data === "string" ? event.data : "");
				});
				socket.addEventListener("close", () => Queue.endUnsafe(messages));
				socket.addEventListener("error", (event) =>
					Queue.failCauseUnsafe(messages, Cause.fail(fail(event))),
				);
				socket.accept();
				return Stream.fromQueue(messages);
			}),
	});
