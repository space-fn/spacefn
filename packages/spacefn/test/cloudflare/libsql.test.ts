// spacefn/libsql runs in workerd, in a Worker and in a Durable Object, against a real
// libSQL server over HTTP: sqld if it's installed, else its Docker image.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const has = (command: string, args: string[]) => spawnSync(command, args).status === 0;
const sqld = has("sqld", ["--version"]);
const docker = !sqld && has("docker", ["info"]);

const port = 4700 + Math.floor(Math.random() * 100);
let dir: string;
let mf: Miniflare;
let server: ChildProcess | undefined;
let container: string | undefined;

const until = async (check: () => Promise<boolean>, ms = 30_000) => {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200)))
		if (await check().catch(() => false)) return;
	throw new Error("timed out");
};

describe.skipIf(!sqld && !docker)("spacefn/libsql in workerd", () => {
	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "spacefn-libsql-"));
		if (sqld)
			server = spawn(
				"sqld",
				["--http-listen-addr", `127.0.0.1:${port}`, "--db-path", join(dir, "data.sqld")],
				{
					stdio: "ignore",
				},
			);
		else {
			const run = spawnSync(
				"docker",
				["run", "-d", "--rm", "-p", `${port}:8080`, "ghcr.io/tursodatabase/libsql-server:latest"],
				{
					encoding: "utf8",
				},
			);
			container = run.stdout.trim();
		}
		await until(async () => (await fetch(`http://127.0.0.1:${port}/health`)).ok);

		const scriptPath = join(dir, "worker.js");
		await build({
			entryPoints: [new URL("./fixture/libsql.ts", import.meta.url).pathname],
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
			bindings: { LIBSQL_URL: `http://127.0.0.1:${port}` },
			durableObjects: { ROOM: { className: "Room", useSQLite: true } },
		});
		await mf.ready;
	}, 90_000);

	afterAll(async () => {
		await mf?.dispose();
		server?.kill("SIGTERM");
		if (container) spawnSync("docker", ["stop", container]);
		await rm(dir, { recursive: true, force: true });
	});

	const call = async (path: string) => {
		const response = await mf.dispatchFetch(`https://app.test${path}`);
		return { status: response.status, body: await response.json() };
	};

	it("migrates and runs the generated queries from a Worker", async () => {
		expect(await call("/worker?text=one")).toEqual({ status: 200, body: 1 });
		expect(await call("/worker?text=two")).toEqual({ status: 200, body: 2 });
	});

	it("runs them from inside a Durable Object too", async () => {
		expect(await call("/durable-object?text=three")).toEqual({ status: 200, body: 3 });
	});

	it("commits a transaction, and rolls back one that fails", async () => {
		expect(await call("/transactions")).toEqual({ status: 200, body: ["committed"] });
	});
});
