import type { MiddlewareHandler } from "hono";

import { createOtlpExporter } from "./otlp";
import { setTracer } from "./span";

/** Environment keys read by tracing. Both are optional. */
export interface TraceEnv {
	/** Full OTLP/HTTP traces URL. Empty or unset keeps export off. */
	OTLP_ENDPOINT?: unknown;
	/** JSON object of extra headers, e.g. `{"x-honeycomb-team":"..."}`. Store tokens as secrets. */
	OTLP_HEADERS?: unknown;
	/** Service name on exported spans. Defaults to `spacefn`. */
	OTLP_SERVICE_NAME?: unknown;
}

/** Parses `OTLP_HEADERS`. The error never includes the value. */
export function parseOtlpHeaders(raw: string): Record<string, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("OTLP_HEADERS must be a JSON object");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("OTLP_HEADERS must be a JSON object");
	}
	for (const value of Object.values(parsed)) {
		if (typeof value !== "string") throw new Error("OTLP_HEADERS values must be strings");
	}
	return parsed as Record<string, string>;
}

let configuredKey: string | undefined;

/**
 * Installs the OTLP exporter described by `env`. Calling it again with the same
 * settings does nothing, so it is safe on every request.
 */
export function configureTracing(env: TraceEnv): void {
	const endpoint = typeof env.OTLP_ENDPOINT === "string" ? env.OTLP_ENDPOINT.trim() : "";
	const rawHeaders = typeof env.OTLP_HEADERS === "string" ? env.OTLP_HEADERS : "{}";
	const serviceName =
		typeof env.OTLP_SERVICE_NAME === "string" && env.OTLP_SERVICE_NAME
			? env.OTLP_SERVICE_NAME
			: "spacefn";

	const key = JSON.stringify([endpoint, rawHeaders, serviceName]);
	if (key === configuredKey) return;
	configuredKey = key;

	if (endpoint === "") {
		setTracer(undefined);
		return;
	}
	setTracer(
		createOtlpExporter({
			endpoint,
			headers: parseOtlpHeaders(rawHeaders),
			serviceName,
		}),
	);
}

/** Applies the tracing configuration from the request's environment. */
export function traceConfig(): MiddlewareHandler {
	return async (c, next) => {
		configureTracing(c.env as TraceEnv);
		await next();
	};
}
