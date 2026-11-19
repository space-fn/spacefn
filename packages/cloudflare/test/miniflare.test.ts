// Runs the fixture app in workerd, on real D1, KV, R2, Queues and Durable Objects.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let mf: Miniflare;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "spacefn-cf-"));
	const scriptPath = join(dir, "worker.js");
	await build({
		entryPoints: [new URL("./fixture/app.ts", import.meta.url).pathname],
		outfile: scriptPath,
		bundle: true,
		format: "esm",
		platform: "browser",
		conditions: ["workerd", "worker", "browser"],
		external: ["cloudflare:*"],
		logLevel: "error",
	});
	mf = new Miniflare({
		modules: true,
		scriptPath,
		modulesRoot: dir,
		compatibilityDate: "2026-07-01",
		d1Databases: ["DB_NOTES"],
		kvNamespaces: ["KV"],
		r2Buckets: ["BLOB"],
		durableObjects: {
			SPACE_BUS: "SpaceBus",
			SPACE_RATE_LIMITER: { className: "SpaceRateLimiter", useSQLite: true },
			COUNTER: { className: "Counter", useSQLite: true },
		},
		queueProducers: { QUEUE_EMAILS: "emails" },
		queueConsumers: { emails: { maxBatchTimeout: 0.05 } },
	});
	await mf.ready;
}, 60_000);

afterAll(async () => {
	await mf?.dispose();
	await rm(dir, { recursive: true, force: true });
});

const call = async (path: string, init?: RequestInit) => {
	const response = await mf.dispatchFetch(`https://app.test${path}`, init as never);
	const text = await response.text();
	const json = response.headers.get("content-type")?.includes("json");
	return { status: response.status, body: json ? JSON.parse(text) : text || null };
};

describe("worker in workerd", () => {
	it("migrates D1 at startup and runs typed queries", async () => {
		const post = (text: string) =>
			call("/notes", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text }),
			});
		expect((await post("one")).body).toEqual({ added: "one" });
		await post("two");
		expect((await call("/notes")).body).toEqual(["one", "two"]);
	});

	it("uses Workers KV and R2", async () => {
		expect((await call("/storage")).body).toEqual({
			kv: "hi",
			blob: "hello",
			contentType: "text/plain",
			keys: ["files/a.txt"],
		});
	});

	it("rate limits through the Durable Object", async () => {
		const statuses = [];
		for (let i = 0; i < 3; i++) statuses.push((await call("/limited")).status);
		expect(statuses).toEqual([200, 200, 429]);
	});

	it("delivers Bus messages through the topic's Durable Object", async () => {
		expect((await call("/bus")).body).toEqual(["first", "second"]);
	});

	it("runs an app Durable Object on its own migrated SQLite", async () => {
		expect((await call("/counter")).body).toBe(1);
		expect((await call("/counter")).body).toBe(2);
	});

	it("sends to a queue and consumes it", async () => {
		expect((await call("/email", { method: "POST" })).body).toEqual({ queued: true });
		let mailed = null;
		for (let i = 0; i < 50 && mailed === null; i++) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			mailed = (await call("/email")).body;
		}
		expect(mailed).toBe("ada");
	});

	it("runs crons on their schedule", async () => {
		const app = await mf.getWorker();
		await app.scheduled({ cron: "0 3 * * *" });
		const kv = await mf.getKVNamespace("KV");
		expect(await kv.get("cron")).toBe("ran");
	});
});
