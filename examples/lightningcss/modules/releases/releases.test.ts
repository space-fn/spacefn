import { Layer } from "effect";
import { memoryServices, testApp, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

describe("the release notes", () => {
	it("lists each release, newest first", async () => {
		await using app = testApp(
			manifest,
			Layer.mergeAll(memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))),
		);
		const page = await (await app.fetch("/")).text();
		expect(page.indexOf("1.1.0")).toBeLessThan(page.indexOf("1.0.0"));
		expect(page).toContain('<time datetime="2026-10-01">');
	});
});
