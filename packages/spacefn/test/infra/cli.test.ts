import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixtureApp, processes, space, text, until } from "./fixture.ts";

/** Ctrl-C, as in a terminal: the CLI stops what it runs and exits. */
const interrupt = async (cli: ReturnType<typeof space>) => {
	cli.child.kill("SIGINT");
	const timer = setTimeout(() => cli.child.kill("SIGKILL"), 15_000);
	await cli.exited;
	clearTimeout(timer);
};

describe("space docs", () => {
	it("serves the app's docs and spacefn's until Ctrl-C", async () => {
		const app = await fixtureApp("bun-app");
		const port = 4950 + Math.floor(Math.random() * 40);
		const docs = space(app.root, ["docs", "--port", String(port)]);
		try {
			await until(() => docs.log().includes(`http://localhost:${port}/`), 20_000);
			expect(await text(`http://localhost:${port}/writing-docs.md`)).toContain(
				"<title>Writing docs · spacefn docs</title>",
			);
		} finally {
			await interrupt(docs);
			await app.cleanup();
		}
	}, 30_000);

	it("says how to install spacefn-docs when the app doesn't have it", async () => {
		const root = mkdtempSync(join(tmpdir(), "space-nodocs-"));
		writeFileSync(join(root, "package-lock.json"), "{}");
		// pnpm's bin shims set NODE_PATH to its store, where every package resolves.
		const docs = space(root, ["docs"], { NODE_PATH: "" });
		expect(await docs.exited).toBe(1);
		expect(docs.log()).toMatch(/add it: npm install --save-dev spacefn-docs@\d/);
	});
});

describe("space dev on Cloudflare (alchemy dev)", () => {
	let app: Awaited<ReturnType<typeof fixtureApp>>;
	let dev: ReturnType<typeof space>;
	let base: string;
	beforeAll(async () => {
		app = await fixtureApp("cloudflare-app");
		dev = space(app.root, ["dev", "--stage", "test"], { GREETING: "hello", API_KEY: "sekret" });
		await until(() => /ready at (http:\/\/\S+)/.test(dev.log()));
		base = /ready at (http:\/\/\S+)/.exec(dev.log())![1]!.replace(/\/$/, "");
	}, 90_000);
	afterAll(async () => {
		await interrupt(dev);
		expect(processes(app.root)).toEqual([]);
		await app.cleanup();
	});

	it("binds D1 (migrated), KV, the env and its secrets", async () => {
		expect(await text(`${base}/`)).toMatch(/<body>\s?hello 1 none 6\s?<\/body>/);
	});

	it("binds the queue and its consumer", async () => {
		await fetch(`${base}/send`, { method: "POST" });
		await until(async () => (await text(`${base}/`)).includes("done in workerd"), 20_000);
	});

	it("binds R2, since the app imports Blob", async () => {
		expect(await (await fetch(`${base}/files`)).json()).toEqual({
			text: "stored in r2",
			type: "text/plain",
		});
	});

	it("binds the Durable Objects behind RateLimiter", async () => {
		const statuses = [];
		for (let i = 0; i < 3; i++) statuses.push((await fetch(`${base}/limited`)).status);
		expect(statuses).toEqual([200, 200, 429]);
	});
});

describe.skipIf(spawnSync("bun", ["--version"]).status !== 0)("space dev and build on Bun", () => {
	it("runs route code on Bun, and stops it all on Ctrl-C", async () => {
		const app = await fixtureApp("bun-app");
		const port = 4900 + Math.floor(Math.random() * 50);
		const dev = space(app.root, ["dev", "--port", String(port)], {
			SPACE_DATA_DIR: join(app.data, "dev"),
		});
		try {
			await until(async () => (await fetch(`http://localhost:${port}/runtime`)).ok, 30_000);
			expect(await text(`http://localhost:${port}/runtime`)).toBe("bun");
		} finally {
			await interrupt(dev);
			await app.cleanup();
		}
		// The script with this app's root, so no other command line matches.
		expect(processes(`dev-bun.ts ${app.root}`)).toEqual([]);
	}, 60_000);

	it("builds the client and the server bundle", async () => {
		const app = await fixtureApp("bun-app");
		try {
			const build = space(app.root, ["build"]);
			expect(await build.exited).toBe(0);
			expect(build.log()).toContain("wrote dist/");
			expect(existsSync(join(app.root, "dist/server/index.js"))).toBe(true);
		} finally {
			await app.cleanup();
		}
	}, 60_000);
});

const docker = process.env.SPACE_TEST_DOCKER === "1" && spawnSync("docker", ["info"]).status === 0;

// Opt in with SPACE_TEST_DOCKER=1: it builds an image and runs a container in local Docker.
describe.skipIf(!docker)("space deploy and destroy on Bun (Docker)", () => {
	it("builds and deploys the app with its volume, then destroys it", async () => {
		const app = await fixtureApp("bun-app");
		try {
			// The fixture's Dockerfile takes dist/, as an app's own Dockerfile may.
			expect(await space(app.root, ["build"]).exited).toBe(0);
			const deploy = space(app.root, ["deploy", "--stage", "test", "--yes"]);
			expect(await deploy.exited).toBe(0);
			// configs/infra.ts maps the container to port 4890.
			await until(async () => (await fetch("http://localhost:4890/version")).ok, 20_000);
			await fetch("http://localhost:4890/send", { method: "POST" });
			await until(
				async () => (await text("http://localhost:4890/")).includes("done in dev"),
				20_000,
			);
			const destroy = space(app.root, ["destroy", "--stage", "test", "--yes"]);
			expect(await destroy.exited).toBe(0);
		} finally {
			await app.cleanup();
		}
	}, 180_000);
});
