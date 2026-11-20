import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { clientAddress, route, type SpaceManifest } from "spacefn";
import { database } from "spacefn/runtime";

import { app } from "../../src/bun/app.ts";
import { dir } from "./helpers.ts";

process.env.SPACE_DATA_DIR = `${dir}/app`;

const empty = { name: "t", middleware: [], queues: [], crons: [], db: [] } as const;

class CfDb extends database<CfDb, {}>()({ name: "cf", migrations: [], queries: {} }) {}

describe("app", () => {
	it("answers requests and passes the client address on", async () => {
		const handle = app({
			...empty,
			routes: [
				{
					kind: "route",
					path: "/ip",
					params: [],
					file: "app/routes/ip.ts",
					module: { default: route({ GET: Effect.map(clientAddress, (ip) => ({ ip })) }) },
				},
			],
		} satisfies SpaceManifest);
		const response = await handle.fetch(new Request("http://app/ip"), "10.0.0.7");
		expect(await response.json()).toEqual({ ip: "10.0.0.7" });
		await handle.dispose();
	});

	it("answers 500 when the app can't start, and says why", async () => {
		const handle = app({
			...empty,
			routes: [],
			db: [{ name: "cf", driver: "d1", binding: "DB_CF", module: { default: CfDb } }],
		} satisfies SpaceManifest);
		const errors: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => void errors.push(args.join(" "));
		try {
			expect((await handle.fetch(new Request("http://app/"))).status).toBe(500);
		} finally {
			console.error = original;
		}
		expect(String(errors[0])).toContain("only runs on Cloudflare");
		await handle.dispose().catch(() => {});
	});
});
