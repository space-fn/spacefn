import { Layer } from "effect";
import { memoryServices, testDb, testEnv, testHttp } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";

import todos from "./index.ts";

/** The page served in memory: a fresh database, memory services and the env's defaults. */
const app = () =>
	testHttp(
		{
			routes: [
				{
					path: "/",
					params: [],
					file: "app/routes/index.ts",
					module: { default: todos },
				},
			],
		},
		Layer.mergeAll(testDb(MainDb), memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))),
	);

const post = (fields: Record<string, string>) => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(fields).toString(),
});

describe("the todos page", () => {
	it("adds a todo, then lists it", async () => {
		const page = app();
		const added = await page.fetch("/?__action=add", post({ title: "Write docs" }));
		expect([added.status, added.headers.get("location")]).toEqual([303, "/"]);
		const list = await (await page.fetch("/")).text();
		expect(list).toContain("Hello from spacefn");
		expect(list).toContain("Write docs");
		await page.dispose();
	});

	it("asks for a title instead of adding an empty todo", async () => {
		const page = app();
		const response = await page.fetch("/?__action=add", post({ title: "" }));
		expect(response.status).toBe(422);
		expect(await response.text()).toContain("Give the todo a title.");
		await page.dispose();
	});
});
