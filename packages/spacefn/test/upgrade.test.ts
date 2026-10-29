import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { applyUpgradeTemplate } from "../src/upgrade";

const created: string[] = [];

afterEach(() => {
	for (const dir of created.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("applyUpgradeTemplate", () => {
	test("updates present framework dependencies and replaces only framework docs", async () => {
		const root = mkdtempSync(join(tmpdir(), "space-upgrade-"));
		created.push(root);
		const template = join(root, "latest-template");
		mkdirSync(join(template, "docs", "spacefn"), { recursive: true });
		mkdirSync(join(root, "docs", "spacefn"), { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify(
				{
					name: "my-app",
					dependencies: { spacefn: "^0.4.0", hono: "^4.0.0", custom: "1.0.0" },
					devDependencies: { "vite-plus": "^1.0.0" },
				},
				null,
				"\t",
			),
		);
		writeFileSync(
			join(template, "package.json"),
			JSON.stringify({
				dependencies: { spacefn: "^0.5.0", hono: "^4.13.13", cf: "1.0.0" },
				devDependencies: { "vite-plus": "^1.3.0", typescript: "^7.0.0" },
			}),
		);
		writeFileSync(join(root, "docs", "spacefn", "old.md"), "old");
		writeFileSync(join(root, "docs", "custom.md"), "keep");
		writeFileSync(join(template, "docs", "spacefn", "index.md"), "latest");

		const updated = await applyUpgradeTemplate(root, template);
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
			dependencies: Record<string, string>;
			devDependencies: Record<string, string>;
		};

		expect(updated).toEqual(["hono", "spacefn", "vite-plus"]);
		expect(pkg.dependencies).toEqual({ spacefn: "^0.5.0", hono: "^4.13.13", custom: "1.0.0" });
		expect(pkg.devDependencies).toEqual({ "vite-plus": "^1.3.0" });
		expect(existsSync(join(root, "docs", "spacefn", "old.md"))).toBe(false);
		expect(readFileSync(join(root, "docs", "spacefn", "index.md"), "utf8")).toBe("latest");
		expect(readFileSync(join(root, "docs", "custom.md"), "utf8")).toBe("keep");
	});
});
