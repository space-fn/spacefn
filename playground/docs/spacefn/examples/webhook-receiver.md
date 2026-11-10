# Signed webhook receiver

This example verifies a timestamped HMAC signature over the raw request body,
validates the event shape, then queues the event for asynchronous processing.
Adapt the header names and signing format to the provider's documented
protocol; signature formats are not interchangeable.

The route and the queue consumer are setup. Verifying the signature, checking
the event, and applying it are rules, so they live in `modules/webhooks/`,
where a test can call them with a fixed secret and clock.

## Verify the event

```ts
// modules/webhooks/verify.ts

import { AppError } from "@utils/errors";

const encoder = new TextEncoder();
const MAX_SKEW_SECONDS = 5 * 60;

export interface WebhookEvent {
	id: string;
	type: string;
	raw: string;
}

function decodeHex(value: string): Uint8Array<ArrayBuffer> | undefined {
	if (!/^[\da-f]{64}$/i.test(value)) return undefined;
	const bytes = new Uint8Array(32);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** Checks `sha256=<hex>` over `<timestamp>.<raw>` and returns the parsed event. */
export async function verifyWebhook(input: {
	raw: string;
	timestamp: string;
	signature: string;
	secret: string;
	nowSeconds: number;
}): Promise<WebhookEvent> {
	const signature = decodeHex(input.signature.replace(/^sha256=/, ""));
	const seconds = Number(input.timestamp);
	if (
		!signature ||
		!Number.isSafeInteger(seconds) ||
		Math.abs(input.nowSeconds - seconds) > MAX_SKEW_SECONDS
	) {
		throw new AppError("unauthorized", "Invalid signature.", "invalid_signature");
	}

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(input.secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const signed = encoder.encode(`${input.timestamp}.${input.raw}`);
	if (!(await crypto.subtle.verify("HMAC", key, signature, signed))) {
		throw new AppError("unauthorized", "Invalid signature.", "invalid_signature");
	}

	let event: unknown;
	try {
		event = JSON.parse(input.raw);
	} catch {
		throw new AppError("invalid", "The body is not JSON.", "invalid_json");
	}
	if (
		typeof event !== "object" ||
		event === null ||
		!("id" in event) ||
		typeof event.id !== "string" ||
		!("type" in event) ||
		typeof event.type !== "string"
	) {
		throw new AppError("invalid", "The event has no id or type.", "invalid_event");
	}
	return { id: event.id, type: event.type, raw: input.raw };
}
```

The signature is checked before the body is parsed, so an unsigned payload
never reaches `JSON.parse`. The five-minute window limits replay duration;
idempotency below is still required.

## Read a bounded body

Reading at most a fixed number of bytes is a small helper that works on any
`Request`, so it lives in `utils/`:

```ts
// utils/body.ts

/** The body as text, or `undefined` once it passes `maxBytes`, declared or streamed. */
export async function readBody(request: Request, maxBytes: number): Promise<string | undefined> {
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
```

## Receive and enqueue

The route reads the headers and the bounded body, calls the module, and hands
the verified event to the queue:

```ts
// app/routes/webhooks/provider.ts

import { verifyWebhook } from "@modules/webhooks";
import { queues } from "@space/queues";
import { readBody } from "@utils/body";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const raw = await readBody(c.req.raw, 256 * 1024);
	if (raw === undefined) return c.json({ error: "payload_too_large" }, 413);

	const event = await verifyWebhook({
		raw,
		timestamp: c.req.header("x-hook-timestamp") ?? "",
		signature: c.req.header("x-hook-signature") ?? "",
		secret: c.env.WEBHOOK_SECRET,
		nowSeconds: Date.now() / 1000,
	});

	await queues.webhookEvents.send({ eventId: event.id, eventType: event.type, payload: event.raw });
	return c.body(null, 202);
});
```

An `AppError` from `verifyWebhook` reaches `app.onError`, which answers 401 or
400 with its code. Keep `WEBHOOK_SECRET` in a Worker secret. This example
expects a 64-character hexadecimal SHA-256 signature over
`<timestamp>.<raw-body>`, and bounds both a declared and a streamed body to
256 KiB before verifying it.

## Process the event

Providers often retry a delivery even after the receiver returned success, so
applying an event must be idempotent. The module records the event id under a
unique constraint before acting on it:

```ts
// modules/webhooks/process.ts

import { recordWebhookEvent } from "@space/db/main_db";
import type { DbReader } from "spacefn/db";

export interface WebhookJob {
	eventId: string;
	eventType: string;
	payload: string;
}

export async function processWebhookEvent(db: DbReader, job: WebhookJob) {
	try {
		await recordWebhookEvent(db, { eventId: job.eventId, eventType: job.eventType });
	} catch (error) {
		if (String(error).includes("UNIQUE")) return; // already handled
		throw error;
	}
	// Apply the event's effects here, keyed by job.eventType.
}
```

```ts
// modules/webhooks/index.ts

export { processWebhookEvent, type WebhookJob } from "./process";
export { verifyWebhook, type WebhookEvent } from "./verify";
```

The consumer is setup: it connects the database, calls the module for each
message, and decides between acknowledging and retrying:

```ts
// app/queues/webhook-events.ts

import { mainDb } from "@app/db/main_db";
import { processWebhookEvent, type WebhookJob } from "@modules/webhooks";
import { defineQueue } from "spacefn/queues";

export default defineQueue<WebhookJob>(async (batch, env) => {
	const db = await mainDb((env as { DB: D1Database }).DB);
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

See [modules](../directory-structure/modules.md), [queues](../directory-structure/queues.md),
[HTTP handlers](../directory-structure/routes.md), and
[environment bindings](../directory-structure/env.md).
