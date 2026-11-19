export interface ServerSentEvent {
	data: string;
	event?: string;
	id?: string;
	retry?: number;
}

export interface SSEHub {
	subscribe(): Response;
	publish(event: ServerSentEvent): void;
}

const encoder = new TextEncoder();
const streamHighWaterMark = 16;

function validateField(value: string, name: string): string {
	if (/[\r\n]/.test(value)) throw new TypeError(`SSE ${name} cannot contain a line break`);
	return value;
}

function encodeEvent(event: ServerSentEvent): Uint8Array {
	const lines: string[] = [];
	if (event.event !== undefined) lines.push(`event: ${validateField(event.event, "event")}`);
	if (event.id !== undefined) {
		if (event.id.includes("\0")) throw new TypeError("SSE id cannot contain a null character");
		lines.push(`id: ${validateField(event.id, "id")}`);
	}
	if (event.retry !== undefined) {
		if (!Number.isSafeInteger(event.retry) || event.retry < 0) {
			throw new TypeError("SSE retry must be a non-negative integer");
		}
		lines.push(`retry: ${event.retry}`);
	}
	for (const line of event.data.replace(/\r\n?/g, "\n").split("\n")) {
		lines.push(`data: ${line}`);
	}
	return encoder.encode(`${lines.join("\n")}\n\n`);
}

export function createSSEHub(): SSEHub {
	const clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();

	return {
		subscribe() {
			const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>(
				{},
				{ highWaterMark: streamHighWaterMark },
				{ highWaterMark: streamHighWaterMark },
			);
			const writer = writable.getWriter();
			clients.add(writer);
			void writer.closed.then(
				() => clients.delete(writer),
				() => clients.delete(writer),
			);

			return new Response(readable, {
				headers: {
					"content-type": "text/event-stream; charset=utf-8",
					"cache-control": "no-cache, no-transform",
					"x-accel-buffering": "no",
				},
			});
		},

		publish(event) {
			const chunk = encodeEvent(event);
			for (const writer of clients) {
				if (writer.desiredSize === null || writer.desiredSize <= 0) {
					clients.delete(writer);
					void writer.abort().catch(() => undefined);
					continue;
				}
				void writer.write(chunk).catch(() => clients.delete(writer));
			}
		},
	};
}
