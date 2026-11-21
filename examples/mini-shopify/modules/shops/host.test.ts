import { Effect, Redacted } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseHost, tursoHost } from "./host.ts";

const host = tursoHost({
	org: "acme-org",
	apiToken: Redacted.make("api-token"),
	group: "shops",
	groupToken: Redacted.make("group-token"),
});

const create = (name: string) =>
	Effect.runPromise(DatabaseHost.use((h) => h.create(name)).pipe(Effect.provide(host)));

afterEach(() => vi.unstubAllGlobals());

// The Platform API, answered here: the test checks the request, not Turso.
describe("the Turso host", () => {
	it("creates the database in the group, and gives its libsql:// URL", async () => {
		const fetch = vi.fn(async (_url: URL, _init: RequestInit) =>
			Response.json({
				database: { DbId: "1", Name: "shop-acme", Hostname: "shop-acme-org.turso.io" },
			}),
		);
		vi.stubGlobal("fetch", fetch);
		expect(await create("shop-acme")).toBe("libsql://shop-acme-org.turso.io");
		const [url, init] = fetch.mock.calls[0]!;
		expect(String(url)).toBe("https://api.turso.tech/v1/organizations/acme-org/databases");
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer api-token");
		expect(JSON.parse(init.body as string)).toEqual({ name: "shop-acme", group: "shops" });
	});

	it("fails with HostError when Turso refuses", async () => {
		vi.stubGlobal("fetch", async () => Response.json({ error: "taken" }, { status: 409 }));
		await expect(create("shop-acme")).rejects.toMatchObject({ _tag: "HostError" });
	});
});
