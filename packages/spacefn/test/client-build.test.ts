import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { runClientBuild } from "../src/client/build";
import { generateClientManifestSource } from "../src/client/generate";
import { sync } from "../src/sync";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-client-"));
	await mkdir(join(root, "app", "client"), { recursive: true });
	await writeFile(join(root, "app", "client", "counter.ts"), "export const n = 1;\n");
	await writeFile(join(root, "app", "client", "site.css"), "body { color: red; }\n");
	await mkdir(join(root, "app", "routes"), { recursive: true });
	await writeFile(join(root, "app", "routes", "index.ts"), "");
});

afterEach(() => rm(root, { recursive: true, force: true }));

test("sync generates client.ts and client-manifest.ts", async () => {
	await sync(root, "dev");
	const client = await readFile(join(root, ".space", "client.ts"), "utf8");
	expect(client).toContain('ClientEntry = "counter.ts" | "site.css"');
	expect(client).toContain('ClientScriptEntry = "counter.ts"');
	expect(client).toContain("script(name: ClientScriptEntry)");
	expect(client).not.toContain("script(name: ClientEntry)");
	expect(client).toContain("export function script");
	const manifest = await readFile(join(root, ".space", "client-manifest.ts"), "utf8");
	expect(manifest).toContain('"/_client/counter.ts"');
	expect(manifest).toContain('"/_client/site.css"');
});

test("client manifest retains script URLs alongside imported CSS", () => {
	const manifest = generateClientManifestSource(["counter.ts", "site.css"], {
		"counter.ts": {
			js: "/_client/counter-a1b2c3.js",
			css: ["/_client/counter-d4e5f6.css"],
		},
		"site.css": { css: ["/_client/site-a1b2c3.css"] },
	});

	expect(manifest).toContain(
		'"counter.ts": { js: "/_client/counter-a1b2c3.js", css: ["/_client/counter-d4e5f6.css"] }',
	);
	expect(manifest).toContain('"site.css": { css: ["/_client/site-a1b2c3.css"] }');
});

test("runClientBuild rejects cloudflare scheme imports", async () => {
	await writeFile(join(root, "app", "client", "bad.ts"), 'import "cloudflare:workers";\n');
	const assetsDir = join(root, "assets-out3");
	await mkdir(assetsDir, { recursive: true });
	const builder = {
		config: {
			root,
			resolve: { alias: {} },
			environments: { client: { build: { outDir: assetsDir } } },
		},
	};
	await expect(runClientBuild(root, ["bad.ts"], builder)).rejects.toThrow();
});

test("runClientBuild rejects out-of-allowlist imports", async () => {
	await writeFile(join(root, "app", "client", "bad.ts"), 'import "../env";\n');
	const assetsDir = join(root, "assets-out2");
	await mkdir(assetsDir, { recursive: true });
	const builder = {
		config: {
			root,
			resolve: { alias: {} },
			environments: { client: { build: { outDir: assetsDir } } },
		},
	};
	await expect(runClientBuild(root, ["bad.ts"], builder)).rejects.toThrow();
});

test("runClientBuild emits hashed files and a manifest map", async () => {
	const assetsDir = join(root, "assets-out");
	await mkdir(assetsDir, { recursive: true });
	const builder = {
		config: {
			root,
			resolve: { alias: {} },
			environments: { client: { build: { outDir: assetsDir } } },
		},
	};
	const manifest = await runClientBuild(root, ["counter.ts", "site.css"], builder);
	expect(manifest["counter.ts"]?.js).toMatch(/^\/_client\/counter-.+\.js$/);
	expect(manifest["site.css"]?.css?.[0]).toMatch(/^\/_client\/site-.+\.css$/);
});

test("runClientBuild allows the service-worker entry to control the app scope", async () => {
	await writeFile(
		join(root, "app", "client", "service-worker.js"),
		'self.addEventListener("fetch", () => {});\n',
	);
	const assetsDir = join(root, "assets-service-worker");
	await mkdir(assetsDir, { recursive: true });
	await writeFile(join(assetsDir, "_headers"), "/*\n  X-Frame-Options: DENY\n");
	const builder = {
		config: {
			root,
			resolve: { alias: {} },
			environments: { client: { build: { outDir: assetsDir } } },
		},
	};

	const manifest = await runClientBuild(root, ["service-worker.js"], builder);
	const headers = await readFile(join(assetsDir, "_headers"), "utf8");
	expect(manifest["service-worker.js"]?.js).toMatch(/^\/_client\/service-worker-.+\.js$/);
	expect(headers).toContain("X-Frame-Options: DENY");
	expect(headers).toContain("/_client/service-worker-*.js\n  Service-Worker-Allowed: /");
});

test("runClientBuild captures CSS imported by a JS entry", async () => {
	await writeFile(join(root, "app", "client", "style.css"), "body { color: blue; }\n");
	await writeFile(
		join(root, "app", "client", "counter.ts"),
		'import "./style.css";\nexport const n = 1;\n',
	);
	const assetsDir = join(root, "assets-css");
	await mkdir(assetsDir, { recursive: true });
	const builder = {
		config: {
			root,
			resolve: { alias: {} },
			environments: { client: { build: { outDir: assetsDir } } },
		},
	};
	const manifest = await runClientBuild(root, ["counter.ts"], builder);
	expect(manifest["counter.ts"]?.js).toMatch(/^\/_client\/counter-.+\.js$/);
	expect(manifest["counter.ts"]?.css?.[0]).toMatch(/^\/_client\/.+\.css$/);
});
