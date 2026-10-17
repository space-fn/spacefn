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
