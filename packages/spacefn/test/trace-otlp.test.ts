import { describe, expect, test, vi } from "vite-plus/test";

import { createOtlpExporter, toOtlpRequest, type SpanRecord } from "../src/trace";

const base: SpanRecord = {
  traceId: "0af7651916cd43dd8448eb211c80319c",
  spanId: "b7ad6b7169203331",
  name: "http.request",
  kind: "server",
  startTimeMs: 1_700_000_000_000,
  endTimeMs: 1_700_000_000_250,
  attributes: {},
};

describe("toOtlpRequest", () => {
  test("encodes ids, times and the service name", () => {
    const request = toOtlpRequest([base], "app");
    const resource = request.resourceSpans[0]?.resource.attributes;
    expect(resource).toEqual([{ key: "service.name", value: { stringValue: "app" } }]);
    const span = request.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(span).toMatchObject({
      traceId: base.traceId,
      spanId: base.spanId,
      name: "http.request",
      kind: 2,
      startTimeUnixNano: "1700000000000000000",
      endTimeUnixNano: "1700000000250000000",
      status: { code: 1 },
    });
    expect(span).not.toHaveProperty("parentSpanId");
  });

  test("encodes each attribute type", () => {
    const request = toOtlpRequest(
      [
        {
          ...base,
          parentSpanId: "1111111111111111",
          attributes: { s: "x", i: 3, d: 1.5, b: true },
        },
      ],
      "app",
    );
    const span = request.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(span?.parentSpanId).toBe("1111111111111111");
    expect(span?.attributes).toEqual([
      { key: "s", value: { stringValue: "x" } },
      { key: "i", value: { intValue: "3" } },
      { key: "d", value: { doubleValue: 1.5 } },
      { key: "b", value: { boolValue: true } },
    ]);
  });

  test("marks errored spans", () => {
    const request = toOtlpRequest([{ ...base, error: "down" }], "app");
    expect(request.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.status).toEqual({
      code: 2,
      message: "down",
    });
  });
});

describe("createOtlpExporter", () => {
  test("sends buffered spans in one POST and clears the buffer", async () => {
    const send = vi.fn(async () => new Response(null, { status: 200 }));
    const exporter = createOtlpExporter({
      endpoint: "https://otel.test/v1/traces",
      headers: { "x-token": "t" },
      serviceName: "app",
      fetch: send as unknown as typeof fetch,
    });
    exporter.onEnd(base);
    exporter.onEnd({ ...base, spanId: "2222222222222222" });
    await exporter.flush();
    await exporter.flush();

    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://otel.test/v1/traces");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json", "x-token": "t" });
    const body = JSON.parse(init.body as string);
    expect(body.resourceSpans[0].scopeSpans[0].spans).toHaveLength(2);
  });

  test("reports failures and does not throw", async () => {
    const onError = vi.fn();
    const exporter = createOtlpExporter({
      endpoint: "https://otel.test",
      serviceName: "app",
      fetch: (async () => new Response("no", { status: 503 })) as unknown as typeof fetch,
      onError,
    });
    exporter.onEnd(base);
    await expect(exporter.flush()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "OTLP endpoint answered 503" }),
    );
  });

  test("reports network errors and does not throw", async () => {
    const onError = vi.fn();
    const exporter = createOtlpExporter({
      endpoint: "https://otel.test",
      serviceName: "app",
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
      onError,
    });
    exporter.onEnd(base);
    await exporter.flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
  });

  test("does nothing when there is nothing to send", async () => {
    const send = vi.fn();
    const exporter = createOtlpExporter({
      endpoint: "https://otel.test",
      serviceName: "app",
      fetch: send as unknown as typeof fetch,
    });
    await exporter.flush();
    expect(send).not.toHaveBeenCalled();
  });
});
