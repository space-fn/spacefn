import { expect, test } from "vitest";

import { defineSpace } from "../src/cloudflare";

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
