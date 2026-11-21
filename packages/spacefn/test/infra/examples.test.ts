import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder } from "vite";
import { describe, expect, it } from "vitest";

const examples = fileURLToPath(new URL("../../../../examples/", import.meta.url));

/** Builds `examples/<name>` with its own Vite config: its client CSS and JS, and the manifest. */
const built = async (name: string) => {
	const root = join(examples, name);
	const builder = await createBuilder({
		configFile: join(root, "configs", "vite.ts"),
		root,
		logLevel: "silent",
	});
	await builder.buildApp();
	const client = join(root, "dist", "client");
	const read = async (ext: string) => {
		const files = (await readdir(join(client, "assets"))).filter((file) => file.endsWith(ext));
		return (
			await Promise.all(files.map((file) => readFile(join(client, "assets", file), "utf8")))
		).join("");
	};
	const result = {
		css: await read(".css"),
		js: await read(".js"),
		manifest: JSON.parse(await readFile(join(client, ".vite", "manifest.json"), "utf8")) as Record<
			string,
			{ readonly isEntry?: boolean }
		>,
	};
	await rm(join(root, "dist"), { recursive: true, force: true });
	return result;
};

const builtCss = async (name: string) => (await built(name)).css;

describe("the CSS examples build", () => {
	it("tailwind: the classes from app/, modules/ and lib/, with the theme's tokens", async () => {
		const css = await builtCss("tailwind");
		// lib/ui/layout.ts, lib/ui/components.ts, modules/team/views.ts
		for (const rule of [".font-display", ".rounded-card", ".sm\\:grid-cols-2", ".text-brand-700"])
			expect(css).toContain(rule);
		expect(css).toContain("--color-brand-600:");
	}, 60_000);

	it("lightningcss: nesting, custom media from another file and light-dark(), lowered", async () => {
		const css = await builtCss("lightningcss");
		expect(css).toContain(".releases h2{");
		expect(css).toContain("@media (width<40rem){.releases time{");
		expect(css).toContain("--lightningcss-dark");
		for (const left of ["&", "@custom-media", "--narrow", "light-dark("])
			expect(css).not.toContain(left);
	}, 60_000);
});

describe("the island examples build", () => {
	it.each([
		["react", "app/client/cart.tsx"],
		["solid", "app/client/cart.tsx"],
		["vue", "app/client/cart.ts"],
		["svelte", "app/client/cart.ts"],
	])(
		"%s: the cart entry, with its component compiled in",
		async (name, entry) => {
			const { js, manifest } = await built(name);
			expect(manifest[entry]?.isEntry).toBe(true);
			expect(manifest["app/client/site.css"]?.isEntry).toBe(true);
			expect(js).toContain("Total: ");
		},
		60_000,
	);
});
