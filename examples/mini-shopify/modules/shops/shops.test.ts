import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Layer } from "effect";
import { form, memoryServices, testApp, testDb, testEnv } from "spacefn/testing";
import { describe, expect, it } from "vitest";

import Env from "#configs/env.ts";
import PlatformDb from "#space/db/platform.ts";
import { manifest } from "#space/manifest.ts";

import { localHost } from "./host.ts";
import { ShopDatabases } from "./shops.ts";

/** The app in memory, with each shop's database a file in a fresh folder. */
const app = () => {
	const dir = mkdtempSync(join(tmpdir(), "mini-shopify-"));
	const services = Layer.mergeAll(
		memoryServices,
		Env.layer.pipe(Layer.provide(testEnv({}))),
		testDb(PlatformDb),
		localHost(dir),
	);
	return { dir, shops: testApp(manifest, Layer.provideMerge(ShopDatabases.layer, services)) };
};

describe("shops", () => {
	it("gives each shop its own database", async () => {
		const { dir, shops } = app();
		await using _ = shops;
		const created = await shops.fetch("/?__action=create", form({ name: "Acme", slug: "acme" }));
		expect([created.status, created.headers.get("location")]).toEqual([303, "/s/acme"]);
		await shops.fetch("/?__action=create", form({ name: "Globex", slug: "globex" }));

		await shops.fetch("/s/acme?__action=add", form({ name: "Mug", price: "12.5", stock: "2" }));
		const acme = await (await shops.fetch("/s/acme")).text();
		expect(acme).toContain("<h1>Acme</h1>");
		expect(acme).toContain("<td>$12.50</td>");
		expect(await (await shops.fetch("/s/globex")).text()).not.toContain("Mug");
		expect(await (await shops.fetch("/")).text()).toContain('<a href="/s/globex">Globex</a>');
		// Opened, and migrated, by the first request to each shop.
		expect(existsSync(join(dir, "shop-acme.db"))).toBe(true);
		expect(existsSync(join(dir, "shop-globex.db"))).toBe(true);
	});

	it("sells from stock, and refuses a taken address or a shop that isn't there", async () => {
		const { shops } = app();
		await using _ = shops;
		await shops.fetch("/?__action=create", form({ name: "Acme", slug: "acme" }));
		await shops.fetch("/s/acme?__action=add", form({ name: "Mug", price: "12", stock: "1" }));
		await shops.fetch("/s/acme?__action=sell", form({ id: "1" }));
		await shops.fetch("/s/acme?__action=sell", form({ id: "1" }));
		expect(await (await shops.fetch("/s/acme")).text()).toContain("<td>0 left</td>");

		const taken = await shops.fetch("/?__action=create", form({ name: "Again", slug: "acme" }));
		expect(taken.status).toBe(409);
		expect(
			(await shops.fetch("/?__action=create", form({ name: "Bad", slug: "No!" }))).status,
		).toBe(422);
		expect((await shops.fetch("/s/nope")).status).toBe(404);
	});
});
