import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { OtlpExporter } from "effect/observability";

import { telemetry } from "../src/telemetry.ts";

const collector = () => {
	const sent: { url: string; body: string }[] = [];
	const layer = Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((request, url) =>
			Effect.sync(() => {
				const body =
					request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
				sent.push({ url: url.toString(), body });
				return HttpClientResponse.fromWeb(request, new Response("{}", { status: 200 }));
			}),
		),
	);
	return { sent, layer };
};

const run = (env: Record<string, string>) => {
	const { sent, layer } = collector();
	const program = Effect.gen(function* () {
		yield* Effect.void.pipe(Effect.withSpan("todos.add"));
		yield* (yield* OtlpExporter.Flusher).flush;
	}).pipe(
		Effect.provide(
			telemetry("todo-app").pipe(
				Layer.provide(layer),
				Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
			),
		),
	);
	return Effect.as(program, sent);
};

describe("telemetry", () => {
	it.effect("exports spans as OTLP JSON under the app's name", () =>
		Effect.gen(function* () {
			const sent = yield* run({ OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.test" });
			const traces = sent.find((request) => request.url === "https://otel.test/v1/traces");
			expect(traces?.body).toContain('"todos.add"');
			expect(traces?.body).toContain('"stringValue":"todo-app"');
		}),
	);

	it.effect("takes OTEL_SERVICE_NAME over the app's name", () =>
		Effect.gen(function* () {
			const sent = yield* run({
				OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.test",
				OTEL_SERVICE_NAME: "todos-prod",
			});
			expect(sent.find((r) => r.url.endsWith("/v1/traces"))?.body).toContain(
				'"stringValue":"todos-prod"',
			);
		}),
	);

	it.effect("defaults exporters to otlp, but an explicit none wins", () =>
		Effect.gen(function* () {
			const sent = yield* run({
				OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.test",
				OTEL_TRACES_EXPORTER: "none",
			});
			expect(sent.some((r) => r.url.endsWith("/v1/traces"))).toBe(false);
		}),
	);

	it.effect("is off without an endpoint", () =>
		Effect.gen(function* () {
			expect(yield* run({})).toEqual([]);
		}),
	);
});
