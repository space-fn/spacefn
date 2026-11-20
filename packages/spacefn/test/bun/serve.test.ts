import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dir } from "./helpers.ts";

const script = fileURLToPath(new URL("fixture/server.ts", import.meta.url));
const hasBun = spawnSync("bun", ["--version"]).status === 0;

const freePort = () =>
	new Promise<number>((resolve) => {
		const server = createServer().listen(0, () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
	});

const processesOf = (path: string) =>
	spawnSync("pgrep", ["-f", path], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);

describe.skipIf(!hasBun)("serve, under Bun", () => {
	let server: ChildProcess;
	let base: string;
	let log = "";
	const call = async (path: string, body?: unknown) => {
		const response = await fetch(base + path, {
			method: body === undefined ? "GET" : "POST",
			...(body === undefined
				? {}
				: { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
		});
		return { status: response.status, headers: response.headers, body: await response.text() };
	};
	const json = async (path: string, body?: unknown) => JSON.parse((await call(path, body)).body);

	beforeAll(async () => {
		const port = await freePort();
		base = `http://127.0.0.1:${port}`;
		server = spawn("bun", [script], {
			env: { ...process.env, PORT: String(port), SPACE_DATA_DIR: `${dir}/serve` },
			stdio: ["ignore", "pipe", "pipe"],
		});
		server.stdout!.on("data", (chunk) => (log += chunk));
		server.stderr!.on("data", (chunk) => (log += chunk));
		for (let i = 0; i < 100 && !log.includes("is listening"); i++)
			await new Promise((resolve) => setTimeout(resolve, 100));
		expect(log).toContain("is listening");
	});

	afterAll(() => {
		if (server.exitCode === null) server.kill("SIGKILL");
	});

	it("serves the client build before routes", async () => {
		const file = await call("/assets/hello.txt");
		expect(file.body).toBe("hello from the client build\n");
		expect(file.headers.get("cache-control")).toContain("immutable");
		expect((await call("/../package.json")).status).toBe(404);
	});

	it("serves routes on a libSQL file database", async () => {
		await json("/notes", { text: "first" });
		expect(await json("/notes")).toEqual(["first"]);
		expect((await json("/whoami")).ip).toBe("127.0.0.1");
	});

	it("consumes queues in another process, which can reach live requests over the Bus", async () => {
		const web = (await json("/whoami")).pid;
		const waiting = json("/mail?to=ada");
		await new Promise((resolve) => setTimeout(resolve, 300));
		await json("/mail", { to: "ada" });
		const { pid } = await waiting;
		expect(pid).toEqual(expect.any(Number));
		expect(pid).not.toBe(web);
	});

	it("keeps serving when the queue process crashes, and restarts it", async () => {
		const before = (await json("/mail?to=ada")).pid;
		await json("/mail", { to: "crash" });
		for (let i = 0; i < 50 && !log.includes("queues process exited"); i++)
			await new Promise((resolve) => setTimeout(resolve, 100));
		expect(log).toContain("The queues process exited (1)");
		expect((await call("/whoami")).status).toBe(200);
		await new Promise((resolve) => setTimeout(resolve, 1_500));
		await json("/mail", { to: "bo" });
		const after = (await json("/mail?to=bo")).pid;
		expect(after).toEqual(expect.any(Number));
		expect(after).not.toBe(before);
	});

	it("stops every process on SIGTERM", async () => {
		expect(processesOf(script).length).toBe(3);
		const exited = new Promise<number | null>((resolve) => server.once("exit", resolve));
		server.kill("SIGTERM");
		expect(await exited).toBe(0);
		for (let i = 0; i < 30 && processesOf(script).length > 0; i++)
			await new Promise((resolve) => setTimeout(resolve, 100));
		expect(processesOf(script)).toEqual([]);
	});
});
