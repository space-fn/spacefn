import type { Transport } from "./types.js";

export interface HttpTransportOptions {
	endpoint: string;
	/** Sent as `Authorization: Bearer <key>`. */
	key?: string;
	/** Injectable for tests and non-global fetch environments. */
	fetch?: typeof globalThis.fetch;
}

/**
 * POSTs each batch as JSON. Transport errors are thrown; `Trail.flush()`
 * catches them so telemetry can never break the application.
 */
export function httpTransport(options: HttpTransportOptions): Transport {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	return {
		async send(batch) {
			const body = JSON.stringify(batch);
			const headers: Record<string, string> = { "content-type": "application/json" };
			if (options.key) headers.authorization = `Bearer ${options.key}`;
			const res = await doFetch(options.endpoint, {
				method: "POST",
				headers,
				body,
				// Browsers cap keepalive bodies at 64 KB; larger batches send without it.
				keepalive: body.length < 60_000,
			});
			if (!res.ok) throw new Error(`trail: ingest responded with HTTP ${res.status}`);
		},
	};
}
