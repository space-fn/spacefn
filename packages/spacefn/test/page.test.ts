import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref, Schema } from "effect";
import { HttpRouter } from "effect/http";

import { NotFound } from "../src/errors.ts";
import { html } from "../src/html.ts";
import { Input } from "../src/http/input.ts";
import { redirect } from "../src/http/respond.ts";
import { route } from "../src/http/route.ts";
import type { ManifestRoute } from "../src/manifest.ts";
import { Datastar } from "../src/pages/datastar.ts";
import { action, page, pagesLayer, type Page } from "../src/pages/page.ts";
import { Bus } from "../src/services/bus.ts";
import { testHttp } from "../src/testing.ts";

const at = (path: `/${string}`, value: unknown, params: string[] = []) =>
	({
		path,
		params,
		file: `app/routes${path}.ts`,
		module: { default: value as Page },
	}) satisfies ManifestRoute;

const form = (fields: Record<string, string>) => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(fields).toString(),
});

const TodosRef = Effect.runSync(Ref.make<readonly string[]>(["Write"]));

const todos = page({
	loader: Ref.get(TodosRef).pipe(Effect.map((items) => ({ items }))),
	actions: {
		add: action({
			input: Schema.Struct({ title: Schema.NonEmptyString }),
			handler: ({ title }) =>
				Effect.as(
					Ref.update(TodosRef, (items) => [...items, title]),
					{ added: title },
				),
		}),
		clear: action({
			input: Schema.Struct({}),
			handler: () => Effect.as(Ref.set(TodosRef, []), redirect("/done")),
		}),
	},
	render: (ctx) =>
		html`<form action="${ctx.actions.add.url}">
				${ctx.actions.add.data ? html`<p>Added ${ctx.actions.add.data.added}</p>` : ""}
				${
					ctx.actions.add.error
						? html`<p>
								title: ${ctx.actions.add.error.fields.title}
								(${String(ctx.actions.add.error.values.title)})
							</p>`
						: ""
				}
			</form>
			<ul>
				${ctx.data.items.map((item) => html`<li>${item}</li>`)}
			</ul>`,
});

/** The page's markup without the whitespace the formatter adds inside templates. */
const markup = async (response: Response) =>
	(await response.text()).replace(/\s+/g, " ").replace(/> </g, "><").replace(/ </g, "<").trim();

const reset = () => Effect.runSync(Ref.set(TodosRef, ["Write"]));

describe("page", () => {
	it("renders the loader's data as HTML", async () => {
		reset();
		const app = testHttp({ routes: [at("/todos", todos)] });
		const response = await app.fetch("/todos");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(await markup(response)).toBe(
			'<form action="?__action=add"></form><ul><li>Write</li></ul>',
		);
		await app.dispose();
	});

	it("runs an action and re-renders with its data", async () => {
		reset();
		const app = testHttp({ routes: [at("/todos", todos)] });
		const response = await app.fetch("/todos?__action=add", form({ title: "Ship" }));
		expect(response.status).toBe(200);
		expect(await markup(response)).toContain("<p>Added Ship</p><");
		expect(await markup(await app.fetch("/todos"))).toContain("<li>Write</li><li>Ship</li>");
		await app.dispose();
	});

	it("re-renders with the issues and the submitted values when the input doesn't decode", async () => {
		reset();
		const app = testHttp({ routes: [at("/todos", todos)] });
		const response = await app.fetch("/todos?__action=add", form({ title: "" }));
		expect(response.status).toBe(422);
		expect(await markup(response)).toMatch(/<p> ?title: .+ \(\)<\/p>/);
		expect(await markup(await app.fetch("/todos"))).toContain("<ul><li>Write</li></ul>");
		await app.dispose();
	});

	it("passes a response from an action or loader through", async () => {
		reset();
		const gated = page({
			loader: Effect.succeed(redirect("/login")),
			render: () => html`never`,
		});
		const app = testHttp({ routes: [at("/todos", todos), at("/private", gated)] });
		const cleared = await app.fetch("/todos?__action=clear", form({}));
		expect([cleared.status, cleared.headers.get("location")]).toEqual([303, "/done"]);
		const login = await app.fetch("/private");
		expect([login.status, login.headers.get("location")]).toEqual([303, "/login"]);
		await app.dispose();
	});

	it("answers bad action requests and other methods", async () => {
		const plain = page({ render: () => html`<p>hi</p>` });
		const app = testHttp({ routes: [at("/todos", todos), at("/plain", plain)] });
		expect((await app.fetch("/todos", form({}))).status).toBe(400);
		const unknown = await app.fetch("/todos?__action=toString", form({}));
		expect([unknown.status, await unknown.json()]).toEqual([
			404,
			{ error: "NotFound", message: "No action toString" },
		]);
		const post = await app.fetch("/plain", form({}));
		expect([post.status, post.headers.get("allow")]).toEqual([405, "GET"]);
		const put = await app.fetch("/todos", { method: "PUT" });
		expect([put.status, put.headers.get("allow")]).toEqual([405, "GET, POST"]);
		await app.dispose();
	});

	it("reads path params in the loader and answers its errors", async () => {
		const todo = page({
			loader: Effect.gen(function* () {
				const { id } = yield* Input.params(Schema.Struct({ id: Schema.FiniteFromString }));
				if (id !== 1) return yield* new NotFound({ message: "No such todo" });
				return { id };
			}),
			render: (ctx) => html`<h1>Todo ${ctx.data.id}</h1>`,
		});
		const app = testHttp({ routes: [at("/todos/:id", todo, ["id"])] });
		expect(await (await app.fetch("/todos/1")).text()).toBe("<h1>Todo 1</h1>");
		expect((await app.fetch("/todos/2")).status).toBe(404);
		expect((await app.fetch("/todos/abc")).status).toBe(404);
		await app.dispose();
	});

	it("serves pages and routes from one tree, and refuses a file that is neither", async () => {
		const both = testHttp({
			routes: [
				at("/", page({ render: () => html`<h1>Home</h1>` })),
				at("/health", route({ GET: Effect.succeed({ ok: true }) })),
			],
		});
		expect(await (await both.fetch("/")).text()).toBe("<h1>Home</h1>");
		expect(await (await both.fetch("/health")).json()).toEqual({ ok: true });
		await both.dispose();

		// The app doesn't start: a broken file fails at startup, not at the first request.
		const neither = testHttp({ routes: [at("/x", { render: () => html`` })] });
		await expect(neither.fetch("/x")).rejects.toMatchObject({
			code: "ROUTE_EXPORT",
			message: "The default export is not a route or a page",
		});
		await neither.dispose();
	});

	it.effect("refuses a file whose default export isn't a page", () =>
		Effect.gen(function* () {
			const error = yield* Layer.build(
				pagesLayer([at("/x", { render: () => html`` })]).pipe(Layer.provide(HttpRouter.layer)),
			).pipe(Effect.scoped, Effect.flip);
			expect(error).toMatchObject({ code: "PAGE_EXPORT", file: "app/routes/x.ts" });
		}),
	);
});

describe("get actions", () => {
	const count = Effect.runSync(Ref.make(0));
	const counter = page({
		loader: Ref.get(count),
		actions: {
			watch: action({
				method: "get",
				input: Schema.Struct({}),
				handler: () =>
					Datastar.watch(
						["counter"],
						Ref.get(count).pipe(Effect.map((n) => html`<p id="count">${n}</p>`)),
					),
			}),
			search: action({
				method: "get",
				input: Schema.Struct({ q: Schema.String }),
				handler: ({ q }) => Effect.succeed(q.toUpperCase()),
			}),
		},
		render: (ctx) =>
			html`<p id="count" data-init="@get('${ctx.actions.watch.url}')">${ctx.data}</p>
				${ctx.actions.search.data ?? ""}`,
	});

	it("runs a get action from the query string; the page itself has no POST", async () => {
		const app = testHttp({ routes: [at("/counter", counter)] });
		expect(await markup(await app.fetch("/counter?__action=search&q=hi"))).toMatch(/<\/p>\s*HI/);
		const post = await app.fetch("/counter?__action=search", form({ q: "x" }));
		expect([post.status, post.headers.get("allow")]).toEqual([405, "GET"]);
		await app.dispose();
	});

	it("keeps elements live with Datastar.watch", async () => {
		const bus = Effect.runSync(Layer.build(Bus.memory).pipe(Effect.scoped));
		const app = testHttp({ routes: [at("/counter", counter)] }, Layer.succeedContext(bus));

		expect(await markup(await app.fetch("/counter"))).toContain(`@get('?__action=watch')`);

		const response = await app.fetch("/counter?__action=watch", {
			headers: { "datastar-request": "true" },
		});
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
		const next = async () => (await reader.read()).value;

		expect(await next()).toBe(
			'event: datastar-patch-elements\ndata: elements <p id="count">0</p>\n\n',
		);
		Effect.runSync(Ref.set(count, 5));
		await Effect.runPromise(
			Effect.gen(function* () {
				yield* (yield* Bus).publish("counter", "changed");
			}).pipe(Effect.provideContext(bus)),
		);
		expect(await next()).toBe(
			'event: datastar-patch-elements\ndata: elements <p id="count">5</p>\n\n',
		);
		await reader.cancel();
		await app.dispose();
	});
});

it("types ctx from the loader and the actions", () => {
	page({
		loader: Effect.succeed({ n: 1 }),
		actions: {
			save: action({
				input: Schema.Struct({ a: Schema.String }),
				handler: (input) => Effect.succeed(input.a.length),
			}),
			watch: action({ method: "get", input: Schema.Struct({}), handler: () => Effect.void }),
		},
		render: (ctx) => {
			const n: number = ctx.data.n;
			const methods: ["post", "get"] = [ctx.actions.save.method, ctx.actions.watch.method];
			const field: string | undefined = ctx.actions.save.error?.fields.a;
			// @ts-expect-error the input has no field b
			void ctx.actions.save.error?.fields.b;
			const length: number | undefined = ctx.actions.save.data;
			if (length !== undefined) return html`${n + length}${methods}${field}`;
			// @ts-expect-error no such action
			return html`${ctx.actions.remove.url}`;
		},
	});
});
