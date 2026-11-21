import { Layer } from "effect";
import { memoryServices, testApp, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

const app = () =>
	testApp(manifest, Layer.mergeAll(memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))));

describe("the team page", () => {
	it("lists everyone as cards", async () => {
		await using team = app();
		const page = await (await team.fetch("/")).text();
		expect(page).toContain(">The team</h1>");
		expect(page.match(/<article/g)).toHaveLength(4);
	});

	it("answers the live search with the matching members", async () => {
		await using team = app();
		const signals = encodeURIComponent(JSON.stringify({ team: { query: "design" } }));
		const answer = await team.fetch(`/?__action=search&datastar=${signals}`, {
			headers: { "datastar-request": "true" },
		});
		const events = await answer.text();
		expect(events).toContain('<ul id="team-members"');
		expect(events).toContain("Hedy");
		expect(events).not.toContain("Ada");
	});
});
