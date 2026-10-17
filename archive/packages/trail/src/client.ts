export interface TrailClientOptions {
	/** The server-rendered trace id (from `<meta name="x-trace-id">`). */
	traceId: string;
	/** Where to POST batches. The ingest key travels in the body (beacons cannot set headers). */
	endpoint: string;
	key?: string;
	maxRecords?: number;
}

type ClientRecord = Record<string, unknown>;

/**
 * Browser-side reporter: continues the server trace on same-origin fetches
 * (covers Datastar actions), records Datastar request lifecycles, JS errors,
 * page timing and web vitals, and flushes via `sendBeacon`.
 *
 * Invariant: this function is serialized into an inline `<script>` with
 * `toString()`, so it must stay self-contained — no module-scope references.
 */
export function installTrailClient(options: TrailClientOptions): void {
	const cfg = options;
	const max = cfg.maxRecords ?? 100;
	const spans: ClientRecord[] = [];
	const events: ClientRecord[] = [];
	let dropped = 0;

	const push = (list: ClientRecord[], record: ClientRecord) => {
		if (spans.length + events.length >= max) {
			dropped++;
			return;
		}
		list.push(record);
	};

	const rid = () => {
		const buf = new Uint8Array(8);
		crypto.getRandomValues(buf);
		let out = "";
		for (let i = 0; i < buf.length; i++) out += buf[i].toString(16).padStart(2, "0");
		return out;
	};

	// 1. Continue the server trace on every same-origin fetch.
	const originalFetch = window.fetch.bind(window);
	window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url =
			typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
		const baseHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
		const headers = new Headers(baseHeaders);
		try {
			if (new URL(url, window.location.href).origin === window.location.origin) {
				headers.set("traceparent", "00-" + cfg.traceId + "-" + rid() + "-01");
			}
		} catch {
			// Malformed URL: send the request untouched.
		}
		return originalFetch(input, { ...init, headers });
	};

	// 2. Datastar request lifecycle (see the Datastar actions reference).
	const pendingStarts: number[] = [];
	document.addEventListener("datastar-fetch", (e: Event) => {
		const detail: unknown = e instanceof CustomEvent ? e.detail : undefined;
		if (!detail || typeof detail !== "object" || !("type" in detail)) return;
		const type = detail.type;
		if (typeof type !== "string") return;
		if (type === "started") {
			pendingStarts.push(Date.now());
			return;
		}
		if (type === "finished" || type === "error" || type === "retries-failed") {
			const startMs = pendingStarts.shift() ?? Date.now();
			const failed = type !== "finished";
			push(spans, {
				traceId: cfg.traceId,
				spanId: rid(),
				name: failed ? "browser.datastar.error" : "browser.datastar.action",
				kind: "browser",
				status: failed ? "error" : "ok",
				startMs,
				durationMs: Date.now() - startMs,
				attributes: { fetch_type: type },
			});
		}
	});

	// 3. Uncaught errors and rejected promises.
	window.addEventListener("error", (e: ErrorEvent) => {
		push(events, {
			traceId: cfg.traceId,
			name: "browser.error",
			level: "error",
			message: e.message || "script error",
			timestampMs: Date.now(),
			attributes: { source: e.filename, line: e.lineno, column: e.colno },
		});
	});
	window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
		const reason = e.reason as unknown;
		push(events, {
			traceId: cfg.traceId,
			name: "browser.error",
			level: "error",
			message: reason instanceof Error ? reason.message : String(reason),
			timestampMs: Date.now(),
			attributes: { source: "unhandledrejection" },
		});
	});

	// 4. Web vitals. CLS and INP are honest approximations: total shift value
	// and max interaction duration, not the official windowed metrics.
	let lcpMs: number | undefined;
	let clsTotal = 0;
	let inpMax = 0;
	if (typeof PerformanceObserver !== "undefined") {
		try {
			new PerformanceObserver((list) => {
				const last = list.getEntries()[list.getEntries().length - 1];
				if (last) lcpMs = Math.round(last.startTime);
			}).observe({ type: "largest-contentful-paint", buffered: true });
		} catch {
			// Metric unavailable in this browser.
		}
		try {
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if ("value" in entry && typeof entry.value === "number") clsTotal += entry.value;
				}
			}).observe({ type: "layout-shift", buffered: true });
		} catch {
			// Metric unavailable in this browser.
		}
		try {
			// durationThreshold is in the Event Timing spec but missing from
			// this lib.dom's PerformanceObserverInit.
			const eventTimingInit = {
				type: "event",
				durationThreshold: 40,
				buffered: true,
			} as PerformanceObserverInit;
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if ("interactionId" in entry && entry.interactionId && entry.duration > inpMax) {
						inpMax = entry.duration;
					}
				}
			}).observe(eventTimingInit);
		} catch {
			// Metric unavailable in this browser.
		}
	}

	let pageSent = false;
	const flush = async () => {
		let ttfbMs: number | undefined;
		let domContentLoadedMs: number | undefined;
		let loadMs: number | undefined;
		try {
			const nav: unknown = performance.getEntriesByType("navigation")[0];
			// lib.dom types entries as PerformanceEntry; the extended fields
			// below only exist on PerformanceNavigationTiming.
			if (nav && typeof nav === "object" && "responseStart" in nav) {
				const timing = nav as PerformanceNavigationTiming;
				ttfbMs = Math.round(timing.responseStart);
				domContentLoadedMs = Math.round(timing.domContentLoadedEventEnd);
				loadMs = Math.round(timing.loadEventEnd);
			}
		} catch {
			// Navigation timing unavailable.
		}
		const pageAttributes: ClientRecord = {};
		if (ttfbMs !== undefined) pageAttributes.ttfb_ms = ttfbMs;
		if (domContentLoadedMs !== undefined) pageAttributes.dom_content_loaded_ms = domContentLoadedMs;
		if (loadMs !== undefined) pageAttributes.load_ms = loadMs;
		if (lcpMs !== undefined) pageAttributes.lcp_ms = lcpMs;
		if (clsTotal > 0) pageAttributes.cls_total = clsTotal;
		if (inpMax > 0) pageAttributes.inp_max = Math.round(inpMax);
		if (!pageSent) {
			// One page-load span per page: the first flush carries the timing
			// and vitals; later heartbeats only ship collected records.
			pageSent = true;
			push(spans, {
				traceId: cfg.traceId,
				spanId: rid(),
				name: "browser.page.load",
				kind: "browser",
				status: "ok",
				startMs: Math.round(performance.timeOrigin),
				durationMs: loadMs ?? Math.round(performance.now()),
				attributes: pageAttributes,
			});
		}
		if (spans.length === 0 && events.length === 0) return;
		const body = JSON.stringify({
			sdk: "client",
			key: cfg.key,
			sampleInterval: 1,
			spans: spans.splice(0),
			events: events.splice(0),
			droppedRecords: dropped,
		});
		dropped = 0;
		if (navigator.sendBeacon && navigator.sendBeacon(cfg.endpoint, body)) return;
		try {
			await originalFetch(cfg.endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
				keepalive: true,
			});
		} catch {
			// Telemetry must never surface in the page.
		}
	};

	window.addEventListener("pagehide", flush);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") void flush();
	});
	setInterval(() => void flush(), 10_000);
}

/**
 * Inline `<script>` tag that installs the client reporter in an SSR layout.
 * The `<` in the serialized config is escaped so URLs cannot break out of the
 * script element.
 */
export function clientScript(options: TrailClientOptions): string {
	const config = JSON.stringify(options).replace(/</g, "\\u003c");
	return `<script>(${installTrailClient.toString()})(${config});</script>`;
}
