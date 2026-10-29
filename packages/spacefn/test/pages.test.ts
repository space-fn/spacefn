import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Hono } from "hono";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { defineActions, defineLoader, definePage, html, mountPage, raw } from "../src/pages";
import { scanPages } from "../src/pages/scan";
import { sync } from "../src/sync";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-pages-"));
	await mkdir(join(root, "app", "pages", "users"), { recursive: true });
	await mkdir(join(root, "app", "routes"), { recursive: true });
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("pairs each page with its server module and gives it a URL", async () => {
	await writeFile(join(root, "app", "pages", "index.page.ts"), "");
	await writeFile(join(root, "app", "pages", "users", "[id].page.ts"), "");
	await writeFile(join(root, "app", "pages", "users", "[id].server.ts"), "");
	await writeFile(join(root, "app", "pages", "_layout.page.ts"), "");
	expect(await scanPages(join(root, "app", "pages"))).toEqual([
		{ file: "index.page.ts", server: undefined, path: "/" },
		{ file: "users/[id].page.ts", server: "users/[id].server.ts", path: "/users/:id" },
	]);
});

test("refuses a page and a route that serve the same path", async () => {
	await writeFile(join(root, "app", "pages", "about.page.ts"), "");
	await writeFile(join(root, "app", "routes", "about.ts"), "");
	await expect(sync(root, "dev")).rejects.toThrow("both serve /about");
});

test("sync writes routes and pages together and removes the old pages module", async () => {
	await writeFile(join(root, "app", "pages", "hello.page.ts"), "");
	await writeFile(join(root, "app", "routes", "[id].ts"), "");
	await mkdir(join(root, ".space"), { recursive: true });
	await writeFile(join(root, ".space", "pages.ts"), "old generated file");
	await sync(root, "dev");
	const routes = await readFile(join(root, ".space", "routes.ts"), "utf8");
	expect(routes).toContain('mountPage(app, "/hello", page0, undefined);');
	expect(routes).toContain('mountRoute(app, "/:id", route1);');
	expect(routes.indexOf('mountPage(app, "/hello"')).toBeLessThan(
		routes.indexOf('mountRoute(app, "/:id"'),
	);
	await expect(access(join(root, ".space", "pages.ts"))).rejects.toThrow();
	const worker = await readFile(join(root, ".space", "worker.ts"), "utf8");
	expect(worker).not.toContain('from "./pages"');
	expect(worker).not.toContain("registerPages");
});

const todos = [
	{ id: 1, title: "<img src=x onerror=alert(1)>" },
	{ id: 2, title: "buy milk" },
];

const page = definePage<{ todos: typeof todos; notice?: string }>(
	(props) =>
		html`<h1>Board</h1>
			<ul>
				${props.todos.map((todo) => html`<li>${todo.title}</li>`)}
			</ul>
			${props.notice ? html`<p>${props.notice}</p>` : null} ${raw("<footer>static</footer>")}`,
);

const server = {
	loader: defineLoader(() => ({ todos })),
	actions: defineActions({
		add: async (c) => {
			const form = await c.req.formData();
			if (!form.get("title")) return c.json({ error: "bad_request" }, 400);
			return undefined;
		},
		download: () => new Response("file", { headers: { "content-type": "text/plain" } }),
	}),
};

function app() {
	const app = new Hono();
	mountPage(app, "/board", page as never, server as never);
	return app;
}

test("GET renders the page with loader data, escaped", async () => {
	const res = await app().request("/board");
	expect(res.headers.get("content-type")).toContain("text/html");
	const body = await res.text();
	expect(body).toContain("<h1>Board</h1>");
	expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
	expect(body).not.toContain("<img");
	expect(body).toContain("<footer>static</footer>");
});

test("a page without a loader renders with empty props", async () => {
	const plain = new Hono();
	mountPage(plain, "/", definePage(() => html`<p>hi</p>`) as never);
	expect(await (await plain.request("/")).text()).toBe("<p>hi</p>");
});

test("a loader can answer with a redirect", async () => {
	const redirecting = new Hono();
	mountPage(redirecting, "/old", definePage(() => html`<p>never</p>`) as never, {
		loader: defineLoader(
			() => new Response(null, { status: 302, headers: { location: "/board" } }),
		),
	});
	const res = await redirecting.request("/old");
	expect(res.status).toBe(302);
});

test("POST runs the named action and redirects back with 303 when it returns nothing", async () => {
	const body = new URLSearchParams({ title: "new" });
	const res = await app().request("/board?_action=add", {
		method: "POST",
		body,
		redirect: "manual",
	});
	expect(res.status).toBe(303);
	expect(res.headers.get("location")).toBe("/board");
});

test("an action can return its own response", async () => {
	const res = await app().request("/board?_action=download", { method: "POST" });
	expect(await res.text()).toBe("file");
});

test("a POST without an action name is refused", async () => {
	const res = await app().request("/board", { method: "POST" });
	expect(res.status).toBe(400);
});

test("an unknown action is refused, including prototype names", async () => {
	expect((await app().request("/board?_action=nope", { method: "POST" })).status).toBe(404);
	expect((await app().request("/board?_action=constructor", { method: "POST" })).status).toBe(404);
	expect((await app().request("/board?_action=__proto__", { method: "POST" })).status).toBe(404);
});

test("a plain string smuggled past the types is escaped", async () => {
	const server = new Hono();
	const name = "<img src=x onerror=alert(1)>";
	mountPage(server, "/p", (() => `<p>${name}</p>`) as never);
	const body = await (await server.request("/p")).text();
	expect(body).not.toContain(name);
	expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
});

test("html output and raw() pass through unescaped", async () => {
	const server = new Hono();
	mountPage(server, "/p", (() => html`<b>${"<script>"}</b>${raw("<i>ok</i>")}`) as never);
	const body = await (await server.request("/p")).text();
	expect(body).toBe("<b>&lt;script&gt;</b><i>ok</i>");
});
