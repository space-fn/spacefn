import { describe, expect, test } from "vitest";

import { bindings, defineSpace, envBindings } from "../src/cloudflare";
import { boolean, defineEnv, number, secret, string } from "../src/env";

const base = { name: "app", compatibilityDate: "2026-10-01" };

test("points the worker at the generated entry", () => {
	expect(defineSpace(base)).toEqual({
		worker: { ...base, entrypoint: "./.space/worker.ts" },
	});
});

test("lets the app override the entrypoint", () => {
	const config = defineSpace({ ...base, entrypoint: "./custom.ts" });
	expect(config.worker).toMatchObject({ entrypoint: "./custom.ts" });
});

test("re-exports the config builders", async () => {
	const mod = await import("../src/cloudflare");
	expect(mod.bindings.queue({ name: "jobs" })).toMatchObject({ type: "queue" });
	expect(mod.exports.durableObject({ storage: "sqlite" })).toMatchObject({ storage: "sqlite" });
	expect(mod.triggers.scheduled({ schedule: "* * * * *" })).toMatchObject({ type: "scheduled" });
});

describe("envBindings", () => {
	const schema = defineEnv({
		GREETING: string({ default: "hi" }),
		LIMIT: number({ default: 10 }),
		DEBUG: boolean({ default: false }),
		NAME: string(),
		NOTE: string({ optional: true }),
		TOKEN: secret(),
	});

	test("declares defaults as text and everything else as secrets", () => {
		expect(envBindings(schema)).toEqual({
			GREETING: bindings.text("hi"),
			LIMIT: bindings.text("10"),
			DEBUG: bindings.text("false"),
			NAME: bindings.secret(),
			NOTE: bindings.secret(),
			TOKEN: bindings.secret(),
		});
	});
});
