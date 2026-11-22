import { Config, ConfigProvider, Effect, Layer, Option } from "effect";
import type { HttpClient } from "effect/http";
import { Otlp, type OtlpExporter, OtlpSerialization } from "effect/observability";

const EXPORTER_DEFAULTS = {
	OTEL_TRACES_EXPORTER: "otlp",
	OTEL_LOGS_EXPORTER: "otlp",
	OTEL_METRICS_EXPORTER: "otlp",
};

/**
 * Traces, logs and metrics over OTLP, configured by the standard `OTEL_*`
 * variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, ...).
 * Without an endpoint it is off. The service name is `OTEL_SERVICE_NAME`, or
 * the app's name. It sends JSON through `HttpClient`, so it runs on Workers;
 * there the target flushes with `OtlpExporter.Flusher` before the request ends.
 *
 * The `OTEL_*_EXPORTER` variables default to `otlp`, as the OpenTelemetry
 * spec says; Effect alone exports nothing until they are set.
 *
 * Requests (Effect's HTTP server) and queries (`effect/sql`) are traced
 * already; add your own spans with `Effect.withSpan`.
 */
export const telemetry = (
	appName: string,
): Layer.Layer<OtlpExporter.Flusher, never, HttpClient.HttpClient> =>
	Layer.unwrap(
		Effect.gen(function* () {
			const name = yield* Config.String("OTEL_SERVICE_NAME").pipe(Config.option);
			return Otlp.layerFromConfig({
				resource: { serviceName: Option.getOrElse(name, () => appName) },
			});
		}).pipe(Effect.orDie),
	).pipe(
		Layer.provide(OtlpSerialization.layerJson),
		// A fallback, so an explicit `OTEL_TRACES_EXPORTER=none` still wins.
		Layer.provide(ConfigProvider.layerAdd(ConfigProvider.fromUnknown(EXPORTER_DEFAULTS))),
	);
