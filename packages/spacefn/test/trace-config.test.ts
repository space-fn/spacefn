import { Hono } from "hono";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
	configureTracing,
	parseOtlpHeaders,
	setTracer,
	traceConfig,
	traceRequest,
} from "../src/trace";

const realFetch = globalThis.fetch;
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
	send = vi.fn(async () => new Response(null, { status: 200 }));
	globalThis.fetch = send as unknown as typeof fetch;
	configureTracing({});
});

afterEach(() => {
	globalThis.fetch = realFetch;
	setTracer(undefined);
	configureTracing({});
});

test("parses a JSON object of string headers", () => {
	expect(parseOtlpHeaders('{"x-honeycomb-team":"abc"}')).toEqual({ "x-honeycomb-team": "abc" });
});

test("rejects headers that are not a JSON object of strings, without echoing them", () => {
	expect(() => parseOtlpHeaders("[1]")).toThrow("OTLP_HEADERS must be a JSON object");
	expect(() => parseOtlpHeaders("not json hunter2")).toThrow("OTLP_HEADERS must be a JSON object");
	expect(() => parseOtlpHeaders('{"x":1}')).toThrow("OTLP_HEADERS values must be strings");
	try {
		parseOtlpHeaders("not json hunter2");
	} catch (error) {
		expect(String(error)).not.toContain("hunter2");
	}
});

test("exports nothing without an endpoint", async () => {
	const app = new Hono();
	app.use(traceConfig());
	app.use(traceRequest());
	app.get("/", (c) => c.text("ok"));
	await app.request("/", {}, { OTLP_ENDPOINT: "" });
	expect(send).not.toHaveBeenCalled();
});

test("exports request spans to the configured endpoint with the configured headers", async () => {
	const app = new Hono();
	app.use(traceConfig());
	app.use(traceRequest());
	app.get("/", (c) => c.text("ok"));
	const env = {
		OTLP_ENDPOINT: "https://otel.test/v1/traces",
		OTLP_HEADERS: '{"x-token":"t"}',
		OTLP_SERVICE_NAME: "shop",
	};
	const context = { waitUntil: (promise: Promise<unknown>) => void promise } as never;
	await app.fetch(new Request("http://x/"), env, context);

	expect(send).toHaveBeenCalledTimes(1);
	const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
	expect(url).toBe("https://otel.test/v1/traces");
	expect(init.headers).toMatchObject({ "x-token": "t" });
	const body = JSON.parse(init.body as string);
	expect(body.resourceSpans[0].resource.attributes[0]).toEqual({
		key: "service.name",
		value: { stringValue: "shop" },
	});
	expect(body.resourceSpans[0].scopeSpans[0].spans[0].name).toBe("GET /");
});

test("reconfigures only when the settings change", () => {
	configureTracing({ OTLP_ENDPOINT: "https://a.test" });
	configureTracing({ OTLP_ENDPOINT: "https://a.test" });
	expect(send).not.toHaveBeenCalled();
	configureTracing({ OTLP_ENDPOINT: "" });
});
