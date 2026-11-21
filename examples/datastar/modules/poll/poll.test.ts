import { Layer } from "effect";
import { memoryServices, testApp, testDb, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import MainDb from "#space/db/main.ts";
import { manifest } from "#space/manifest.ts";

const app = () =>
	testApp(
		manifest,
		Layer.mergeAll(testDb(MainDb), memoryServices, Env.layer.pipe(Layer.provide(testEnv({})))),
	);

/** A vote as Datastar's @post sends it: the page's signals, as JSON. */
const vote = (choice: string) => ({
	method: "POST",
	headers: { "content-type": "application/json", "datastar-request": "true" },
	body: JSON.stringify({ poll: { choice, voted: "" } }),
});

describe("the poll", () => {
	it("shows the question, a button per answer and empty results", async () => {
		await using poll = app();
		const page = await (await poll.fetch("/")).text();
		expect(page).toContain("<h1>Tabs or spaces?</h1>");
		expect(page).toContain(`data-on:click="$poll.choice = 'tabs'; @post('?__action=vote')"`);
		expect(page).toContain('<poll-meter label="Tabs" value="0"></poll-meter>');
	});

	it("counts a vote, answers with the signal to patch, and shows it in the results", async () => {
		await using poll = app();
		const answer = await poll.fetch("/?__action=vote", vote("tabs"));
		expect(answer.headers.get("content-type")).toBe("text/event-stream");
		expect(await answer.text()).toBe(
			'event: datastar-patch-signals\ndata: signals {"poll":{"voted":"tabs"}}\n\n',
		);
		await poll.fetch("/?__action=vote", vote("spaces"));
		const page = await (await poll.fetch("/")).text();
		expect(page).toContain('<poll-meter label="Tabs" value="50"></poll-meter>');
		expect(page).toContain("<small>1 vote</small>");
	});

	it("refuses an answer that isn't one", async () => {
		await using poll = app();
		expect((await poll.fetch("/?__action=vote", vote("emacs"))).status).toBe(422);
	});
});
