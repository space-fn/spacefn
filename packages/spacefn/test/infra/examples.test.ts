import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBuilder } from "vite";
import { describe, expect, it } from "vitest";

const examples = fileURLToPath(new URL("../../../../examples/", import.meta.url));

/** Builds `examples/<name>` with its own Vite config, and gives its client CSS. */
const builtCss = async (name: string) => {
	const root = join(examples, name);
	const builder = await createBuilder({
		configFile: join(root, "configs", "vite.ts"),
		root,
		logLevel: "silent",
	});
	await builder.buildApp();
	const assets = join(root, "dist", "client", "assets");
	const css = (await readdir(assets)).filter((file) => file.endsWith(".css"));
	const text = (await Promise.all(css.map((file) => readFile(join(assets, file), "utf8")))).join(
		"",
	);
	await rm(join(root, "dist"), { recursive: true, force: true });
	return text;
};

describe("the CSS examples build", () => {
	it("tailwind: the classes from app/, modules/ and lib/, with the theme's tokens", async () => {
		const css = await builtCss("tailwind");
		// lib/ui/layout.ts, lib/ui/components.ts, modules/team/views.ts
		for (const rule of [".font-display", ".rounded-card", ".sm\\:grid-cols-2", ".text-brand-700"])
			expect(css).toContain(rule);
		expect(css).toContain("--color-brand-600:");
	}, 60_000);
});
