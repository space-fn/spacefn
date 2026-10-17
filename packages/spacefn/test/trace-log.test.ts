import { afterEach, expect, test } from "vitest";

import { createLogger, setLogSink, withSpan, type LogRecord } from "../src/trace";

const records: LogRecord[] = [];

afterEach(() => {
	setLogSink(() => undefined);
	records.length = 0;
});

function capture() {
	setLogSink((record) => records.push(record));
}

test("writes structured records with level, message and time", () => {
	capture();
	createLogger().info("started", { port: 8787 });
	expect(records[0]).toMatchObject({ level: "info", message: "started", port: 8787 });
	expect(new Date(records[0]?.time ?? "").toString()).not.toBe("Invalid Date");
});

test("adds the trace and span ids of the current span", async () => {
	capture();
	const log = createLogger();
	await withSpan("work", async (span) => {
		log.warn("inside");
		expect(records[0]).toMatchObject({
			traceId: span.context.traceId,
			spanId: span.context.spanId,
		});
	});
});

test("omits trace ids outside a span", () => {
	capture();
	createLogger().error("outside");
	expect(records[0]).not.toHaveProperty("traceId");
	expect(records[0]).not.toHaveProperty("spanId");
});

test("child loggers keep their base fields", () => {
	capture();
	createLogger({ module: "http" }).child({ route: "/todos" }).debug("hit");
	expect(records[0]).toMatchObject({ module: "http", route: "/todos", level: "debug" });
});
