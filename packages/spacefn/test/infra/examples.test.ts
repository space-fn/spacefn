import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder } from "vite";
import { describe, expect, it } from "vitest";

const examples = fileURLToPath(new URL("../../../../examples/", import.meta.url));

const SKIP = new Set(["node_modules", ".space", ".alchemy", "dist"]);

/**
 * Builds a copy of `examples/<name>` with its own Vite config: its client CSS
 * and JS, and the manifest. A copy, since the example's own tests load its
 * `.space/` meanwhile, and a build writes it for production.
 */
const built = async (name: string) => {
	const example = join(examples, name);
	const root = await mkdtemp(join(tmpdir(), `example-${name}-`));
	await cp(example, root, { recursive: true, filter: (from) => !SKIP.has(basename(from)) });
	await symlink(join(example, "node_modules"), join(root, "node_modules"));
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
	await rm(root, { recursive: true, force: true });
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
		["react", "modules/cart/ui/cart.island.tsx"],
		["solid", "modules/cart/ui/cart.island.tsx"],
		["vue", "modules/cart/ui/cart.island.ts"],
		["svelte", "modules/cart/ui/cart.island.ts"],
	])(
		"%s: the cart entry, with its component compiled in",
		async (name, entry) => {
			const { js, manifest } = await built(name);
			expect(manifest[entry]?.isEntry).toBe(true);
			expect(manifest["app/assets/site.css"]?.isEntry).toBe(true);
			expect(js).toContain("Total: ");
		},
		60_000,
	);
});
