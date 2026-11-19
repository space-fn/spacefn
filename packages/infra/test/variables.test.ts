import { Redacted } from "effect";
import { defineEnv, Env } from "spacefn";
import { describe, expect, it } from "vitest";

import { deployVariables } from "../src/variables.ts";

describe("deployVariables", () => {
	it("passes the app's set variables on, secrets redacted", () => {
		const env = defineEnv({ GREETING: Env.string(), API_KEY: Env.secret(), UNSET: Env.string() });
		const variables = deployVariables(
			{ env, libsql: ["DB_MAIN"] },
			{
				GREETING: "hi",
				API_KEY: "k",
				DB_MAIN_URL: "libsql://x",
				DB_MAIN_AUTH_TOKEN: "t",
				OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel",
				OTEL_EXPORTER_OTLP_HEADERS: "authorization=x",
				HOME: "/home/me",
			},
		);
		expect(Object.keys(variables).sort()).toEqual([
			"API_KEY",
			"DB_MAIN_AUTH_TOKEN",
			"DB_MAIN_URL",
			"GREETING",
			"OTEL_EXPORTER_OTLP_ENDPOINT",
			"OTEL_EXPORTER_OTLP_HEADERS",
		]);
		expect(variables.GREETING).toBe("hi");
		expect(Redacted.isRedacted(variables.API_KEY)).toBe(true);
		expect(Redacted.isRedacted(variables.DB_MAIN_AUTH_TOKEN)).toBe(true);
		expect(Redacted.isRedacted(variables.OTEL_EXPORTER_OTLP_HEADERS)).toBe(true);
		expect(variables.DB_MAIN_URL).toBe("libsql://x");
	});
});
