// --- DataStar Server-Side SSE Helpers -----------------------------------------
// Format SSE events that the DataStar client library consumes
// https://data-star.dev/reference/sse_events

import type { DatastarSSE, PatchElementsOptions, PatchSignalsOptions } from "./types.js";

// --- SSE Event Builder --------------------------------------------------------

interface SSEEvent {
	event: string;
	lines: string[];
}

function formatSSEEvent(evt: SSEEvent): string {
	let raw = `event: ${evt.event}\n`;
	for (const line of evt.lines) {
		raw += `data: ${line}\n`;
	}
	raw += "\n";
	return raw;
}

// --- Shared event builders ----------------------------------------------------

function buildPatchElements(html: string, options?: PatchElementsOptions): SSEEvent {
	const lines: string[] = [`elements ${html}`];
	if (options?.merge) lines.push(`merge ${options.merge}`);
	if (options?.select) lines.push(`select ${options.select}`);
	if (options?.settleDuration != null) lines.push(`settleDuration ${options.settleDuration}`);
	if (options?.useViewTransition != null)
		lines.push(`useViewTransition ${options.useViewTransition}`);
	return { event: "datastar-patch-elements", lines };
}

function buildPatchSignals(
	signals: Record<string, unknown>,
	options?: PatchSignalsOptions,
): SSEEvent {
	const lines: string[] = [`signals ${JSON.stringify(signals)}`];
	if (options?.onlyIfMissing) lines.push("onlyIfMissing true");
	return { event: "datastar-patch-signals", lines };
}

function buildRemoveElements(selectors: string): SSEEvent {
	return {
		event: "datastar-remove-elements",
		lines: [`elements ${selectors}`],
	};
}

function buildRemoveSignals(signalNames: string[]): SSEEvent {
	return {
		event: "datastar-remove-signals",
		lines: [`signals ${signalNames.join(",")}`],
	};
}

function buildExecuteScript(script: string, options?: { autoRemove?: boolean }): SSEEvent {
	const lines: string[] = [`script ${script}`];
	if (options?.autoRemove) lines.push("autoRemove true");
	return { event: "datastar-execute-script", lines };
}

// --- Batch (buffered) implementation ------------------------------------------

class DatastarSSEImpl implements DatastarSSE {
	private events: SSEEvent[] = [];

	patchElements(html: string, options?: PatchElementsOptions): void {
		this.events.push(buildPatchElements(html, options));
	}

	patchSignals(signals: Record<string, unknown>, options?: PatchSignalsOptions): void {
		this.events.push(buildPatchSignals(signals, options));
	}

	removeElements(selectors: string): void {
		this.events.push(buildRemoveElements(selectors));
	}

	removeSignals(signalNames: string[]): void {
		this.events.push(buildRemoveSignals(signalNames));
	}

	executeScript(script: string, options?: { autoRemove?: boolean }): void {
		this.events.push(buildExecuteScript(script, options));
	}

	toResponse(): Response {
		const body = this.events.map(formatSSEEvent).join("");
		return new Response(body, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	}
}

// --- Streaming implementation -------------------------------------------------

class DatastarSSEStream implements DatastarSSE {
	private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	private stream: ReadableStream<Uint8Array>;

	constructor() {
		this.stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				this.controller = controller;
			},
		});
	}

	private write(event: SSEEvent): void {
		if (!this.controller) return;
		const encoded = new TextEncoder().encode(formatSSEEvent(event));
		this.controller.enqueue(encoded);
	}

	patchElements(html: string, options?: PatchElementsOptions): void {
		this.write(buildPatchElements(html, options));
	}

	patchSignals(signals: Record<string, unknown>, options?: PatchSignalsOptions): void {
		this.write(buildPatchSignals(signals, options));
	}

	removeElements(selectors: string): void {
		this.write(buildRemoveElements(selectors));
	}

	removeSignals(signalNames: string[]): void {
		this.write(buildRemoveSignals(signalNames));
	}

	executeScript(script: string, options?: { autoRemove?: boolean }): void {
		this.write(buildExecuteScript(script, options));
	}

	/** Close the stream (call when done sending events) */
	close(): void {
		this.controller?.close();
		this.controller = null;
	}

	toResponse(): Response {
		return new Response(this.stream, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	}
}

// --- Factory functions --------------------------------------------------------

/**
 * Create a batch DataStar SSE response (all events buffered, sent at once).
 *
 * ```ts
 * const sse = datastarSSE();
 * sse.patchSignals({ greeting: "Hello!" });
 * sse.patchElements('<div id="msg">Hi</div>');
 * return sse.toResponse();
 * ```
 */
export function datastarSSE(): DatastarSSE {
	return new DatastarSSEImpl();
}

/**
 * Create a streaming DataStar SSE response (events sent as they happen).
 * Call `.close()` when done, or let the handler return the response
 * and the stream will close when the handler exits.
 *
 * ```ts
 * const sse = datastarSSEStream();
 * sse.patchElements('<div id="step">1</div>');
 * await delay(1000);
 * sse.patchElements('<div id="step">2</div>');
 * sse.close();
 * return sse.toResponse();
 * ```
 */
export function datastarSSEStream(): DatastarSSEStream {
	return new DatastarSSEStream();
}

// --- Read signals from request ------------------------------------------------

/**
 * Read DataStar signals from an incoming request.
 *
 * - GET: signals in `datastar` query parameter (JSON-encoded)
 * - POST/PUT/PATCH/DELETE: signals in JSON body
 *
 * ```ts
 * const signals = await readSignals<MySignals>(request);
 * ```
 */
export async function readSignals<T = Record<string, unknown>>(request: Request): Promise<T> {
	const url = new URL(request.url);

	if (request.method === "GET") {
		const raw = url.searchParams.get("datastar");
		if (!raw) return {} as T;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return {} as T;
		}
	}

	// POST/PUT/PATCH/DELETE — read JSON body
	const text = await request.text();
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
}

export type { DatastarSSE, PatchElementsOptions, PatchSignalsOptions } from "./types.js";
