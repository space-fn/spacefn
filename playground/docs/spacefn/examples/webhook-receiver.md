# Signed webhook receiver

This example verifies a timestamped HMAC signature over the raw request body,
validates the event shape, then queues the event for asynchronous processing.
Adapt the header names and signing format to the provider's documented
protocol; signature formats are not interchangeable.

## Queue the event

Create `app/queues/webhook-events.ts`:

```ts
import { processWebhookEvent } from "@modules/webhooks";
import { defineQueue } from "spacefn/queues";

type WebhookJob = { eventId: string; eventType: string; payload: string };

export default defineQueue<WebhookJob>(async (batch, env) => {
	const db = (env as { DB: D1Database }).DB;
	for (const message of batch.messages) {
		try {
			await processWebhookEvent(db, message.body);
			message.ack();
		} catch (error) {
			console.error("webhook processing failed", message.body.eventId, error);
			message.retry({ delaySeconds: 30 });
		}
	}
});
```

`processWebhookEvent` is app-owned. Make it idempotent by recording
`eventId` under a unique constraint before applying its effects; providers
often retry delivery even when the receiver returned success.

## Verify and enqueue

Create `app/routes/webhooks/provider.ts`:

```ts
import { queues } from "@space/queues";
import { defineHandler } from "spacefn/handler";

const encoder = new TextEncoder();

function decodeHex(value: string): Uint8Array | undefined {
	if (!/^[\da-f]{64}$/i.test(value)) return undefined;
	const bytes = new Uint8Array(32);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

async function readBody(request: Request, maxBytes: number): Promise<string | undefined> {
	const declaredLength = Number(request.headers.get("content-length") ?? "0");
	if (declaredLength > maxBytes) return undefined;

	const reader = request.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return undefined;
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export const POST = defineHandler(async (c) => {
	const timestamp = c.req.header("x-hook-timestamp") ?? "";
	const header = c.req.header("x-hook-signature") ?? "";
	const signature = decodeHex(header.replace(/^sha256=/, ""));
	const seconds = Number(timestamp);
	if (
		!signature ||
		!Number.isSafeInteger(seconds) ||
		Math.abs(Date.now() / 1000 - seconds) > 5 * 60
	) {
		return c.json({ error: "invalid_signature" }, 401);
	}

	const raw = await readBody(c.req.raw, 256 * 1024);
	if (raw === undefined) return c.json({ error: "payload_too_large" }, 413);
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(c.env.WEBHOOK_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature,
		encoder.encode(`${timestamp}.${raw}`),
	);
	if (!valid) return c.json({ error: "invalid_signature" }, 401);

	let event: unknown;
	try {
		event = JSON.parse(raw);
	} catch {
		return c.json({ error: "invalid_json" }, 400);
	}
	if (
		typeof event !== "object" ||
		event === null ||
		!("id" in event) ||
		typeof event.id !== "string" ||
		!("type" in event) ||
		typeof event.type !== "string"
	) {
		return c.json({ error: "invalid_event" }, 400);
	}

	await queues.webhookEvents.send({
		eventId: event.id,
		eventType: event.type,
		payload: raw,
	});
	return c.body(null, 202);
});
```

This example expects a 64-character hexadecimal SHA-256 signature and signs
`<timestamp>.<raw-body>`. Keep the secret in a Worker secret. The five-minute
timestamp window limits replay duration; idempotency is still required.
The receiver bounds both a declared and streamed body to 256 KiB before
parsing it.

See [queues](../directory-structure/queues.md), [HTTP handlers](../directory-structure/routes.md),
and [environment bindings](../directory-structure/env.md).
