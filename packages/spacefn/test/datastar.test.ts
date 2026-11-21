import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema, Stream } from "effect";

import { html, raw } from "../src/html.ts";
import { route, type RouteMethods } from "../src/http/route.ts";
import { Datastar, encodeEvent } from "../src/pages/datastar.ts";
import { testHttp } from "../src/testing.ts";

const serve = (methods: RouteMethods) =>
	testHttp({
		routes: [
			{
				path: "/ds",
				params: [],
				file: "app/routes/ds.ts",
				module: { default: route(methods) },
			},
		],
	});

describe("Datastar events", () => {
	it("writes patch-elements with one data line per line of HTML", () => {
		const event = Datastar.patchElements(raw('<ul id="todos">\n<li>a</li>\n</ul>'));
		expect(encodeEvent(event)).toBe(
			[
				"event: datastar-patch-elements",
				'data: elements <ul id="todos">',
				"data: elements <li>a</li>",
				"data: elements </ul>",
				"",
				"",
			].join("\n"),
		);
	});

	it("writes only the options that differ from Datastar's defaults", () => {
		const event = Datastar.patchElements(html`<li>b</li>`, {
			selector: "#todos",
			mode: "append",
			useViewTransition: true,
			id: "7",
		});
		expect(encodeEvent({ ...event, retry: 2000 })).toBe(
			[
				"event: datastar-patch-elements",
				"id: 7",
				"retry: 2000",
				"data: selector #todos",
				"data: mode append",
				"data: useViewTransition true",
				"data: elements <li>b</li>",
				"",
				"",
			].join("\n"),
		);
		expect(
			encodeEvent(Datastar.patchElements(html`<p></p>`, { mode: "outer", namespace: "html" })),
		).toBe("event: datastar-patch-elements\ndata: elements <p></p>\n\n");
	});

	it("writes signals, removals and scripts", () => {
		expect(encodeEvent(Datastar.patchSignals({ count: 1 }, { onlyIfMissing: true }))).toBe(
			'event: datastar-patch-signals\ndata: onlyIfMissing true\ndata: signals {"count":1}\n\n',
		);
		expect(encodeEvent(Datastar.removeElements("#todo-1"))).toBe(
			"event: datastar-patch-elements\ndata: selector #todo-1\ndata: mode remove\n\n",
		);
		expect(encodeEvent(Datastar.executeScript('alert("</script>")'))).toBe(
			[
				"event: datastar-patch-elements",
				"data: selector body",
				"data: mode append",
				'data: elements <script data-effect="el.remove()">alert("<\\/script>")</script>',
				"",
				"",
			].join("\n"),
		);
	});

	it("refuses a selector that would break the stream", () => {
		expect(() => Datastar.removeElements("#a\ndata: elements <script>")).toThrow(/line break/);
	});
});

describe("Datastar.sse", () => {
	it("answers with an event stream", async () => {
		const app = serve({ POST: Datastar.sse([Datastar.patchSignals({ saved: true })]) });
		const response = await app.fetch("/ds", { method: "POST" });
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(response.headers.get("cache-control")).toBe("no-cache");
		expect(await response.text()).toBe(
			'event: datastar-patch-signals\ndata: signals {"saved":true}\n\n',
		);
		await app.dispose();
	});

	it("streams events from a Stream until it ends", async () => {
		const events = Stream.make(1, 2).pipe(
			Stream.map((n) => Datastar.patchElements(html`<p id="n">${n}</p>`)),
		);
		const app = serve({ GET: Datastar.sse(events) });
		expect(await (await app.fetch("/ds")).text()).toBe(
			'event: datastar-patch-elements\ndata: elements <p id="n">1</p>\n\n' +
				'event: datastar-patch-elements\ndata: elements <p id="n">2</p>\n\n',
		);
		await app.dispose();
	});
});

describe("Datastar.signals", () => {
	const Signals = Schema.Struct({ title: Schema.String });
	const echo = Effect.gen(function* () {
		const fromDatastar = yield* Datastar.isRequest;
		const { title } = yield* Datastar.signals(Signals);
		return { fromDatastar, title };
	});

	it("reads the datastar query parameter on GET and the JSON body otherwise", async () => {
		const app = serve({ GET: echo, POST: echo });
		const query = encodeURIComponent(JSON.stringify({ title: "get" }));
		const get = await app.fetch(`/ds?datastar=${query}`, {
			headers: { "datastar-request": "true" },
		});
		expect(await get.json()).toEqual({ fromDatastar: true, title: "get" });
		const post = await app.fetch("/ds", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: "post" }),
		});
		expect(await post.json()).toEqual({ fromDatastar: false, title: "post" });
		await app.dispose();
	});

	it("is a 400 when the signals don't match", async () => {
		const app = serve({ POST: echo });
		const response = await app.fetch("/ds", { method: "POST", body: "{}" });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "BadRequest",
			message: "Invalid signals",
		});
		await app.dispose();
	});
});
