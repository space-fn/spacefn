import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { parseTraceparent, setTracer, tracedFetch, withSpan, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  setTracer({ onEnd: (record) => records.push(record) });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setTracer(undefined);
  records.length = 0;
});

function answer(status: number) {
  const spy = vi.fn(async (_request: Request) => new Response("ok", { status }));
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

test("records a client span with host, method and status", async () => {
  answer(200);
  await tracedFetch("https://api.example.com/v1/users?token=secret");
  expect(records[0]).toMatchObject({
    name: "HTTP GET api.example.com",
    kind: "client",
    attributes: {
      "http.request.method": "GET",
      "server.address": "api.example.com",
      "http.response.status_code": 200,
    },
  });
  expect(JSON.stringify(records[0])).not.toContain("secret");
});

test("sends the current trace downstream as traceparent", async () => {
  const spy = answer(200);
  await withSpan("outer", () => tracedFetch("https://api.example.com/"));
  const outer = records.find((r) => r.name === "outer");
  const client = records.find((r) => r.kind === "client");
  if (!outer || !client) throw new Error("expected both spans to be recorded");
  const [sentRequest] = spy.mock.calls[0] ?? [];
  const sent = parseTraceparent((sentRequest as Request).headers.get("traceparent"));
  expect(sent).toEqual({ traceId: outer.traceId, spanId: client.spanId });
  expect(client.parentSpanId).toBe(outer.spanId);
});

test("keeps a caller-provided traceparent", async () => {
  const spy = answer(200);
  const own = "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01";
  await tracedFetch("https://api.example.com/", { headers: { traceparent: own } });
  const [sentRequest] = spy.mock.calls[0] ?? [];
  expect((sentRequest as Request).headers.get("traceparent")).toBe(own);
});

test("marks server errors and records network failures", async () => {
  answer(503);
  await tracedFetch("https://api.example.com/");
  expect(records[0]?.error).toBe("HTTP 503");

  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  await expect(tracedFetch("https://api.example.com/")).rejects.toThrow("offline");
  expect(records[1]?.error).toBe("offline");
});
