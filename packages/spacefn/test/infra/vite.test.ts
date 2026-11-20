import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createBuilder, createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assetTags } from "../../src/infra/vite.ts";
import { fixtureApp } from "./fixture.ts";

const until = async (check: () => Promise<boolean>, ms = 10_000) => {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100)))
		if (await check().catch(() => false)) return;
	throw new Error("timed out");
};

describe("assetTags", () => {
	it("points at the sources in dev, behind the Vite client", () => {
		expect(assetTags(["app/client/main.ts", "app/client/style.css"], "/", undefined)).toBe(
			'<script type="module" src="/@vite/client"></script>' +
				'<script type="module" src="/app/client/main.ts"></script>' +
				'<link rel="stylesheet" href="/app/client/style.css">',
		);
		expect(assetTags([], "/", undefined)).toBe("");
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
			"app/client/style.css": { file: "assets/style-4.css", isEntry: true },
		};
		expect(assetTags(["app/client/main.ts", "app/client/style.css"], "/", manifest)).toBe(
			'<link rel="stylesheet" href="/assets/main-2.css">' +
				'<link rel="stylesheet" href="/assets/style-4.css">' +
				'<link rel="modulepreload" href="/assets/shared-3.js">' +
				'<script type="module" src="/assets/main-1.js"></script>',
		);
	});
});

describe("the Bun app", () => {
	let app: Awaited<ReturnType<typeof fixtureApp>>;
	beforeAll(async () => {
		app = await fixtureApp("bun-app");
		process.env.SPACE_DATA_DIR = join(app.data, "dev");
	});
	afterAll(() => app.cleanup());

	describe("in dev", () => {
		let server: ViteDevServer;
		let base: string;
		beforeAll(async () => {
			server = await createServer({
				configFile: join(app.root, ".space", "vite.config.ts"),
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
			const builder = await createBuilder({
				configFile: join(app.root, ".space", "vite.config.ts"),
				logLevel: "silent",
			});
			await builder.buildApp();
		});

		it("is one server bundle that serves the hashed client", async () => {
			const manifest = JSON.parse(
				await readFile(join(app.root, ".space/dist/server/package.json"), "utf8"),
			);
			expect(Object.keys(manifest.dependencies)).toEqual(["@libsql/client"]);
			const port = 4800 + Math.floor(Math.random() * 100);
			const server = spawn("bun", [join(app.root, ".space/dist/server/index.js")], {
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
			} finally {
				server.kill("SIGTERM");
			}
		});
	});
});
