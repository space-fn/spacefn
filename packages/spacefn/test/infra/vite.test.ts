import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createBuilder, createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assetsModule, DEV_HEAD_URL, devHead, entryTags } from "../../src/infra/vite.ts";
import { fixtureApp } from "./fixture.ts";

const until = async (check: () => Promise<boolean>, ms = 10_000) => {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100)))
		if (await check().catch(() => false)) return;
	throw new Error("timed out");
};

/** The `assets` that `assetsModule` exports, with `raw` as plain text. */
const assetsOf = (tags: Record<string, string[]>) =>
	// oxlint-disable-next-line typescript/no-implied-eval -- runs the generated module's own code
	new Function(
		assetsModule(tags)
			.replace('import { raw } from "spacefn";', "const raw = (text) => text;")
			.replace("export const assets =", "return"),
	)() as (...names: string[]) => string;

describe("entryTags", () => {
	it("points at the source in dev, behind the Vite client", () => {
		expect(entryTags("app/client/style.css", "/", undefined)).toEqual([
			'<script type="module" src="/@vite/client"></script>',
			'<link rel="stylesheet" href="/app/client/style.css">',
		]);
	});

	it("points at the hashed files of a build, with their CSS and preloads", () => {
		const manifest = {
			"app/client/main.ts": {
				file: "assets/main-1.js",
				css: ["assets/main-2.css"],
				imports: ["_shared.js"],
				isEntry: true,
			},
			"_shared.js": { file: "assets/shared-3.js" },
		};
		expect(entryTags("app/client/main.ts", "/", manifest)).toEqual([
			'<link rel="stylesheet" href="/assets/main-2.css">',
			'<link rel="modulepreload" href="/assets/shared-3.js">',
			'<script type="module" src="/assets/main-1.js"></script>',
		]);
	});
});

describe("devHead", () => {
	it("keeps the plugins' tags and serves their inline scripts as one module", () => {
		const page =
			'<html><head><script type="module">import a from "/@react-refresh";\na(window);</script>' +
			'<script type="module" src="/@vite/client"></script>' +
			'<script type="module">window.b = 1;</script></head><body></body></html>';
		expect(devHead(page, "/")).toEqual({
			tags:
				`<script type="module" src="/${DEV_HEAD_URL}"></script>` +
				'<script type="module" src="/@vite/client"></script>',
			code: 'import a from "/@react-refresh";\na(window);\nwindow.b = 1;',
		});
	});
});

describe("assets", () => {
	const assets = assetsOf({
		site: ["<vite>", "<site.css>"],
		main: ["<vite>", "<shared.css>", "<main.js>"],
		admin: ["<vite>", "<shared.css>", "<admin.js>"],
	});

	it("joins the entries' tags in the order asked, each tag once", () => {
		expect(assets("site", "main", "admin")).toBe("<vite><site.css><shared.css><main.js><admin.js>");
		expect(assets("admin")).toBe("<vite><shared.css><admin.js>");
	});

	it("names the entries when asked for one that isn't", () => {
		expect(() => assets("mian")).toThrow(
			"there's no client entry \"mian\"; the entries are app/client/'s files: site, main, admin",
		);
		expect(() => assets("toString")).toThrow("no client entry");
	});
});

describe("the Bun app", () => {
	let app: Awaited<ReturnType<typeof fixtureApp>>;
	beforeAll(async () => {
		app = await fixtureApp("services-bun");
		process.env.SPACE_DATA_DIR = join(app.data, "dev");
	});
	afterAll(() => app.cleanup());

	describe("in dev", () => {
		let server: ViteDevServer;
		let base: string;
		beforeAll(async () => {
			// As Alchemy runs it: rooted in .space/, whose vite.config.ts re-exports configs/vite.ts.
			server = await createServer({
				configFile: join(app.root, ".space", "vite.config.ts"),
				root: join(app.root, ".space"),
				server: { port: 0 },
				logLevel: "silent",
			});
			await server.listen();
			base = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
		});
		afterAll(() => server.close());

		it("serves the docs reader at /__space/docs/, with the app around it", async () => {
			const docs = await fetch(`${base}/__space/docs/`);
			expect(docs.status).toBe(200);
			expect(await docs.text()).toContain("<title>spacefn docs</title>");
			expect((await fetch(`${base}/__space/docs/_/reader.css`)).status).toBe(200);
			expect((await fetch(`${base}/__space/docsx`)).status).not.toBe(302);
		});

		it("answers with the app and the source tags", async () => {
			const page = await (await fetch(`${base}/`)).text();
			expect(page).toContain('<script type="module" src="/@vite/client"></script>');
			expect(page).toContain('<link rel="stylesheet" href="/app/client/style.css">');
			expect((await fetch(`${base}/app/client/main.ts`)).status).toBe(200);
		});

		it("serves public/ at /", async () => {
			expect(await (await fetch(`${base}/robots.txt`)).text()).toBe("User-agent: *\n");
		});

		it("runs queue consumers in-process", async () => {
			await fetch(`${base}/send`, { method: "POST" });
			await until(async () => (await (await fetch(`${base}/`)).text()).includes("done in dev"));
		});

		it("serves an edited server file on the next request", async () => {
			const file = join(app.root, "app", "routes", "version.ts");
			const source = await readFile(file, "utf8");
			try {
				expect(await (await fetch(`${base}/version`)).text()).toBe("v1");
				await writeFile(file, source.replace('"v1"', '"v2"'));
				await until(async () => (await (await fetch(`${base}/version`)).text()) === "v2");
			} finally {
				await writeFile(file, source);
			}
		});
	});

	describe.skipIf(spawnSync("bun", ["--version"]).status !== 0)("built", () => {
		beforeAll(async () => {
			// As space build runs it: the app's own config, rooted at the app.
			const builder = await createBuilder({
				configFile: join(app.root, "configs", "vite.ts"),
				root: app.root,
				logLevel: "silent",
			});
			await builder.buildApp();
		});

		it("is one server bundle that serves the hashed client", async () => {
			const manifest = JSON.parse(
				await readFile(join(app.root, "dist/server/package.json"), "utf8"),
			);
			expect(Object.keys(manifest.dependencies)).toEqual(["@libsql/client"]);
			expect(existsSync(join(app.root, "dist/server/robots.txt"))).toBe(false);
			const port = 4800 + Math.floor(Math.random() * 100);
			const server = spawn("bun", [join(app.root, "dist/server/index.js")], {
				env: { ...process.env, PORT: String(port), SPACE_DATA_DIR: join(app.data, "built") },
				stdio: "ignore",
			});
			try {
				const base = `http://127.0.0.1:${port}`;
				await until(async () => (await fetch(`${base}/version`)).ok);
				const page = await (await fetch(`${base}/`)).text();
				const script = /src="(\/assets\/main-[\w-]+\.js)"/.exec(page)?.[1];
				expect(script).toBeDefined();
				expect(page).not.toContain("@vite/client");
				const asset = await fetch(base + script);
				expect(asset.headers.get("cache-control")).toContain("immutable");
				expect(await (await fetch(`${base}/robots.txt`)).text()).toBe("User-agent: *\n");
			} finally {
				server.kill("SIGTERM");
			}
		});
	});
});
