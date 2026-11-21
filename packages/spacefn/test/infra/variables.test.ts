import { Redacted } from "effect";
import { defineEnv, Env } from "spacefn";
import { describe, expect, it } from "vitest";

import { variables } from "../../src/infra/variables.ts";

const environment = {
	GREETING: "hi",
	API_KEY: "k",
	DB_MAIN_URL: "libsql://x",
	DB_MAIN_AUTH_TOKEN: "t",
	HOME: "/home/me",
};

describe("variables", () => {
	it("passes configs/env.ts's set variables on, secrets redacted", () => {
		const env = defineEnv({ GREETING: Env.string(), API_KEY: Env.secret(), UNSET: Env.string() });
		const values = variables(env, environment);
		expect(Object.keys(values).sort()).toEqual(["API_KEY", "GREETING"]);
		expect(values.GREETING).toBe("hi");
		expect(Redacted.isRedacted(values.API_KEY)).toBe(true);
	});

	it("passes the listed variables on, as plain values or secrets", () => {
		const values = variables(
			{ DB_MAIN_URL: "plain", DB_MAIN_AUTH_TOKEN: "secret", OTEL_EXPORTER_OTLP_ENDPOINT: "plain" },
			environment,
		);
		expect(Object.keys(values).sort()).toEqual(["DB_MAIN_AUTH_TOKEN", "DB_MAIN_URL"]);
		expect(values.DB_MAIN_URL).toBe("libsql://x");
		expect(Redacted.isRedacted(values.DB_MAIN_AUTH_TOKEN)).toBe(true);
	});
});
