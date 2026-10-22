import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { runClientBuild } from "../src/client/build";
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
	expect(client).toContain("export function script");
	const manifest = await readFile(join(root, ".space", "client-manifest.ts"), "utf8");
	expect(manifest).toContain('"/_client/counter.ts"');
	expect(manifest).toContain('"/_client/site.css"');
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
