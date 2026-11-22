import { Layer } from "effect";
import { form, memoryServices, testApp, testDb, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";
import { manifest } from "#space/manifest.ts";

/** The app's pages and routes in memory: a fresh database, memory services and the env's defaults. */
const app = () =>
	testApp(
		manifest,
		Layer.mergeAll(testDb(MainDb), memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))),
	);

// The feature through the page at /, as a browser uses it: in memory, with a fresh database.
describe("todos", () => {
	it("adds a todo, then lists it", async () => {
		await using page = app();
		const added = await page.fetch("/?__action=add", form({ title: "Write docs" }));
		expect([added.status, added.headers.get("location")]).toEqual([303, "/"]);
		const list = await (await page.fetch("/")).text();
		expect(list).toContain("Hello from spacefn");
		expect(list).toContain("Write docs");
	});

	it("asks for a title instead of adding an empty todo", async () => {
		await using page = app();
		const response = await page.fetch("/?__action=add", form({ title: "" }));
		expect(response.status).toBe(422);
		expect(await response.text()).toContain("Give the todo a title.");
	});
});
