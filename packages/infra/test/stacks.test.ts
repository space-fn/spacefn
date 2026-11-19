import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixtureApp } from "./fixture.ts";

const alchemy = fileURLToPath(new URL("../node_modules/.bin/alchemy", import.meta.url));

const run = (cwd: string, args: string[], env: Record<string, string> = {}) => {
	let log = "";
	const child = spawn(alchemy, [...args, "alchemy.run.ts", "--no-input", "--stage", "test"], {
		cwd,
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout!.on("data", (chunk) => (log += chunk));
	child.stderr!.on("data", (chunk) => (log += chunk));
	const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
	return { child, exited, log: () => log };
};

const until = async (check: () => Promise<boolean> | boolean, ms = 60_000) => {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200)))
		if (await Promise.resolve(check()).catch(() => false)) return;
	throw new Error("timed out");
};

const text = async (url: string, init?: RequestInit) =>
	(await (await fetch(url, init)).text()).replace(/\s+/g, " ");

/** `alchemy dev` doesn't always exit on SIGTERM; don't leave workerd behind. */
const stop = async (child: ChildProcess, exited: Promise<unknown>) => {
	child.kill("SIGTERM");
	const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
	await exited;
	clearTimeout(timer);
};

describe("the Cloudflare stack under alchemy dev", () => {
	let app: Awaited<ReturnType<typeof fixtureApp>>;
	let dev: ReturnType<typeof run>;
	let base: string;
	beforeAll(async () => {
		app = await fixtureApp("cloudflare-app");
		dev = run(join(app.root, ".space"), ["dev"], { GREETING: "hello", API_KEY: "sekret" });
		await until(() => /ready at (http:\/\/\S+)/.test(dev.log()));
		base = /ready at (http:\/\/\S+)/.exec(dev.log())![1]!.replace(/\/$/, "");
	}, 90_000);
	afterAll(async () => {
		await stop(dev.child, dev.exited);
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

const docker = process.env.SPACE_TEST_DOCKER === "1" && spawnSync("docker", ["info"]).status === 0;

// Opt in with SPACE_TEST_DOCKER=1: it builds an image and runs a container in local Docker.
describe.skipIf(!docker)("the Docker stack", () => {
	it("deploys the built app with its volume, then destroys it", async () => {
		const app = await fixtureApp("bun-app");
		try {
			const builder = await createBuilder({
				configFile: join(app.root, ".space", "vite.config.ts"),
				logLevel: "silent",
			});
			await builder.buildApp();
			const cwd = join(app.root, ".space");
			const deploy = run(cwd, ["deploy", "--yes"]);
			expect(await deploy.exited).toBe(0);
			// configs/infra.ts maps the container to port 4890.
			await until(async () => (await fetch("http://localhost:4890/version")).ok, 20_000);
			await fetch("http://localhost:4890/send", { method: "POST" });
			await until(
				async () => (await text("http://localhost:4890/")).includes("done in dev"),
				20_000,
			);
			const destroy = run(cwd, ["destroy", "--yes"]);
			expect(await destroy.exited).toBe(0);
		} finally {
			await app.cleanup();
		}
	}, 180_000);
});
