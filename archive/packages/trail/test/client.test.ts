import { describe, expect, it } from "vitest";

import { clientScript, type TrailClientOptions } from "../src/client.js";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const ENDPOINT = "https://ingest.example/v1/events";

type Listener = (e: Event) => void | Promise<void>;

interface Harness {
	window: { fetch: (input: unknown, init?: RequestInit) => Promise<Response> };
	windowListeners: Map<string, Listener[]>;
	documentListeners: Map<string, Listener[]>;
	beacons: { url: string; body: string }[];
	fetchCalls: { url: string; init: RequestInit }[];
	triggerObservers: (type: string, entries: unknown[]) => void;
}

function push(map: Map<string, Listener[]>, type: string, fn: Listener): void {
	const bucket = map.get(type) ?? [];
	bucket.push(fn);
	map.set(type, bucket);
}

async function fire(map: Map<string, Listener[]>, type: string, event: Event): Promise<void> {
	await Promise.all((map.get(type) ?? []).map((fn) => fn(event)));
}

/** Boot the shipped inline script against fake browser globals. */
function boot(options: TrailClientOptions, beaconReturns = true): Harness {
	const windowListeners = new Map<string, Listener[]>();
	const documentListeners = new Map<string, Listener[]>();
	const beacons: Harness["beacons"] = [];
	const fetchCalls: Harness["fetchCalls"] = [];
	const observers = new Map<string, (entries: unknown[]) => void>();

	const fakeFetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
		fetchCalls.push({ url: String(input), init: init ?? {} });
		return new Response(null, { status: 200 });
	};
	const fakeWindow = {
		fetch: fakeFetch,
		location: { href: "http://localhost/", origin: "http://localhost" },
		addEventListener: (type: string, fn: Listener) => push(windowListeners, type, fn),
	};
	const fakeDocument = {
		visibilityState: "visible",
		addEventListener: (type: string, fn: Listener) => push(documentListeners, type, fn),
	};
	const fakeNavigator = {
		sendBeacon(url: string, body: string): boolean {
			beacons.push({ url: String(url), body: String(body) });
			return beaconReturns;
		},
	};
	const fakePerformance = {
		timeOrigin: 1_700_000_000_000,
		now: () => 250,
		getEntriesByType: (type: string) =>
			type === "navigation"
				? [{ responseStart: 40, domContentLoadedEventEnd: 120, loadEventEnd: 200 }]
				: [],
	};
	class FakePerformanceObserver {
		constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
			this.callback = callback;
		}
		callback: (list: { getEntries: () => unknown[] }) => void;
		observe(init: { type: string }): void {
			observers.set(init.type, (entries) => this.callback({ getEntries: () => entries }));
		}
	}

	const script = clientScript(options);
	const inner = script.slice("<script>".length, -"</script>".length);
	const factory = new Function(
		"window",
		"document",
		"navigator",
		"performance",
		"PerformanceObserver",
		"CustomEvent",
		"Request",
		"Headers",
		"URL",
		"setInterval",
		inner,
	);
	factory(
		fakeWindow,
		fakeDocument,
		fakeNavigator,
		fakePerformance,
		FakePerformanceObserver,
		CustomEvent,
		Request,
		Headers,
		URL,
		(fn: () => void) => fn,
	);

	return {
		window: fakeWindow,
		windowListeners,
		documentListeners,
		beacons,
		fetchCalls,
		triggerObservers: (type, entries) => observers.get(type)?.(entries),
	};
}

describe("clientScript", () => {
	it("continues the server trace on same-origin fetches only", async () => {
		const h = boot({ traceId: TRACE_ID, endpoint: ENDPOINT });
		await h.window.fetch("http://localhost/todos", { method: "POST" });
		await h.window.fetch("https://other.example/x");
		await h.window.fetch("http://[invalid");

		const [sameOrigin, crossOrigin, malformed] = h.fetchCalls;
		const sent = new Headers(sameOrigin.init.headers).get("traceparent") ?? "";
		expect(sent).toMatch(new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-01$`));
		expect(new Headers(crossOrigin.init.headers).get("traceparent")).toBeNull();
		// Unparseable URLs go out untouched — no traceparent, but not blocked.
		expect(new Headers(malformed.init.headers).get("traceparent")).toBeNull();
		expect(h.fetchCalls).toHaveLength(3);
	});

	it("spans datastar action lifecycles and beats the heartbeat flush", async () => {
		const h = boot({ traceId: TRACE_ID, endpoint: ENDPOINT });
		await fire(
			h.documentListeners,
			"datastar-fetch",
			new CustomEvent("datastar-fetch", { detail: { type: "started" } }),
		);
		await fire(
			h.documentListeners,
			"datastar-fetch",
			new CustomEvent("datastar-fetch", { detail: { type: "finished" } }),
		);
		await fire(h.windowListeners, "pagehide", new Event("pagehide"));

		const batch = JSON.parse(h.beacons[0].body);
		expect(batch.sdk).toBe("client");
		expect(batch.key).toBeUndefined();
		const span = batch.spans.find((s: { name: string }) => s.name === "browser.datastar.action");
		expect(span).toMatchObject({ traceId: TRACE_ID, status: "ok", kind: "browser" });
		expect(span.durationMs).toBeGreaterThanOrEqual(0);

		const page = batch.spans.find((s: { name: string }) => s.name === "browser.page.load");
		expect(page.attributes).toMatchObject({
			ttfb_ms: 40,
			dom_content_loaded_ms: 120,
			load_ms: 200,
		});
	});

	it("reports errors and unhandled rejections", async () => {
		const h = boot({ traceId: TRACE_ID, endpoint: ENDPOINT, key: "wk_test" });
		await fire(
			h.windowListeners,
			"error",
			Object.assign(new Event("error"), {
				message: "boom",
				filename: "a.ts",
				lineno: 1,
				colno: 2,
			}),
		);
		await fire(
			h.windowListeners,
			"unhandledrejection",
			Object.assign(new Event("unhandledrejection"), { reason: new Error("nope") }),
		);
		await fire(h.windowListeners, "pagehide", new Event("pagehide"));

		const batch = JSON.parse(h.beacons[0].body);
		expect(batch.key).toBe("wk_test");
		expect(batch.events.map((e: { message: string }) => e.message)).toEqual(["boom", "nope"]);
		expect(batch.events[0].attributes).toMatchObject({ source: "a.ts", line: 1, column: 2 });
	});

	it("aggregates web vitals into the page span", async () => {
		const h = boot({ traceId: TRACE_ID, endpoint: ENDPOINT });
		h.triggerObservers("largest-contentful-paint", [{ startTime: 321.4 }]);
		h.triggerObservers("layout-shift", [{ value: 0.12 }, { value: 0.03 }]);
		h.triggerObservers("event", [{ interactionId: 7, duration: 88 }, { duration: 5 }]);
		await fire(h.windowListeners, "pagehide", new Event("pagehide"));

		const batch = JSON.parse(h.beacons[0].body);
		const page = batch.spans.find((s: { name: string }) => s.name === "browser.page.load");
		expect(page.attributes).toMatchObject({ lcp_ms: 321, cls_total: 0.15, inp_max: 88 });
	});

	it("caps client-side records and counts drops", async () => {
		const h = boot({ traceId: TRACE_ID, endpoint: ENDPOINT, maxRecords: 2 });
		for (let i = 0; i < 4; i++) {
			await fire(
				h.windowListeners,
				"error",
				Object.assign(new Event("error"), { message: `fail ${i}` }),
			);
		}
		await fire(h.windowListeners, "pagehide", new Event("pagehide"));

		const batch = JSON.parse(h.beacons[0].body);
		expect(batch.events).toHaveLength(2);
		// Two error events overflow the cap; the flush-time page span does too.
		expect(batch.droppedRecords).toBe(3);
	});

	it("falls back to fetch when sendBeacon refuses", async () => {
		const h = boot({ traceId: TRACE_ID, endpoint: ENDPOINT, key: "wk_test" }, false);
		await fire(h.windowListeners, "error", Object.assign(new Event("error"), { message: "boom" }));
		await fire(h.windowListeners, "pagehide", new Event("pagehide"));

		expect(h.beacons).toHaveLength(1);
		const sent = h.fetchCalls.find((call) => call.url === ENDPOINT);
		expect(new Headers(sent?.init.headers).get("content-type")).toBe("application/json");
		expect(JSON.parse(String(sent?.init.body)).key).toBe("wk_test");
	});

	it("escapes script-breaking characters in the config", () => {
		const script = clientScript({
			traceId: TRACE_ID,
			endpoint: "https://ingest.example/a</script>b",
		});
		expect(script.startsWith("<script>")).toBe(true);
		expect(script.endsWith("</script>")).toBe(true);
		expect(script.split("</script>")).toHaveLength(2);
	});
});
