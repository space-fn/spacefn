// Architecture rules: the core never imports a runtime, and each target stays in its lane.
// spacefn is one package; its areas are folders in src/, checked import by import.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, test } from "vitest";

const SRC = resolve(import.meta.dirname, "../src");

type Rule = { readonly name: string; readonly pattern: RegExp };

const rule = (name: string, pattern: RegExp): Rule => ({ name, pattern });

const ALCHEMY = rule("alchemy", /^(alchemy|@alchemy\.run\/.*)(\/.*)?$/);
const CLOUDFLARE = rule(
	"cloudflare",
	/^(cloudflare:.*|@cloudflare\/.*|spacefn\/cloudflare|@effect\/sql-d1|@effect\/sql-sqlite-do)$/,
);
const BUN = rule(
	"bun",
	/^(bun|bun:.*|@types\/bun|spacefn\/bun|@effect\/platform-bun|@effect\/sql-sqlite-bun)$/,
);
const PLATFORM = rule("@effect/platform-*", /^@effect\/platform-.*$/);
const PLATFORM_NODE = rule("@effect/platform-node", /^@effect\/platform-node$/);
const INFRA = rule("infra", /^(spacefn\/(vite|infra)(\/.*)?|vite)$/);
const EFFECT = rule("effect", /^(effect|@effect\/.*)(\/.*)?$/);
const SELF = rule("spacefn", /^spacefn(\/.*)?$/);
const NODE = rule("node builtins", /^node:.*$/);

type Area = "sql" | "core" | "cloudflare" | "bun" | "infra";

interface Boundary {
	/** Imports the area never makes. */
	readonly forbid: readonly Rule[];
	/** Imports its runtime code never makes; files matching `nodeOnly` are exempt. */
	readonly runtimeForbid?: readonly Rule[];
	readonly nodeOnly?: RegExp;
	/** Areas it may reach with a relative import. Others are reached by name, e.g. `spacefn/internal/runtime`. */
	readonly reaches?: readonly Area[];
}

const BOUNDARIES: Record<Area, Boundary> = {
	// Pure SQL tooling. Only the `spacefn/internal/sql/node` helpers (fs, node:sqlite) may touch Node.
	sql: {
		forbid: [ALCHEMY, CLOUDFLARE, BUN, PLATFORM, INFRA, EFFECT, SELF],
		runtimeForbid: [NODE],
		nodeOnly: /^sql\/node\//,
	},
	// Codegen only ever runs in Node (the CLI uses it), so it may use node:* builtins.
	core: {
		forbid: [ALCHEMY, CLOUDFLARE, BUN, PLATFORM, INFRA],
		runtimeForbid: [NODE],
		nodeOnly: /^codegen\//,
		reaches: ["sql"],
	},
	cloudflare: { forbid: [ALCHEMY, BUN, INFRA, PLATFORM_NODE] },
	bun: { forbid: [ALCHEMY, CLOUDFLARE, INFRA, PLATFORM_NODE] },
	infra: { forbid: [] },
};

const AREAS = ["sql", "cloudflare", "bun", "infra"] as const;

/** The area of a path relative to src/. */
const areaOf = (rel: string): Area => {
	const top = rel.split(sep)[0]!;
	return (AREAS as readonly string[]).includes(top) ? (top as Area) : "core";
};

export const importsOf = (source: string): string[] => {
	const found = new Set<string>();
	const patterns = [
		// Static forms start a line, so code inside string literals (codegen templates) is skipped.
		/^[ \t]*(?:import|export)\s[^"'`;]*?\bfrom\s*["']([^"']+)["']/gm,
		/^[ \t]*import\s*["']([^"']+)["']/gm,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) for (const m of source.matchAll(pattern)) found.add(m[1]!);
	return [...found];
};

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(c|m)?tsx?$/.test(entry) ? [path] : [];
	});

const violations = (names: readonly string[], rules: readonly Rule[]) =>
	names.flatMap((name) =>
		rules.filter((r) => r.pattern.test(name)).map((r) => `${name} (${r.name})`),
	);

describe("importsOf", () => {
	test("finds static, side-effect, dynamic and require imports", () => {
		const source = [
			`import { a } from "effect";`,
			`import type { B } from "@cloudflare/workers-types";`,
			`export * from "./local.ts";`,
			`import "bun:sqlite";`,
			`const m = await import("alchemy");`,
			`const n = require("node:fs");`,
			`import {\n  multi,\n  line,\n} from "@effect/platform-bun";`,
			`const template = 'import { worker } from "spacefn/cloudflare";';`,
		].join("\n");
		expect(importsOf(source).sort()).toEqual(
			[
				"./local.ts",
				"@cloudflare/workers-types",
				"@effect/platform-bun",
				"alchemy",
				"bun:sqlite",
				"effect",
				"node:fs",
			].sort(),
		);
	});
});

const files = sourceFiles(SRC).map((file) => ({ file, rel: relative(SRC, file) }));

describe.each(Object.entries(BOUNDARIES) as [Area, Boundary][])(
	"spacefn %s boundaries",
	(area, { forbid, runtimeForbid = [], nodeOnly, reaches = [] }) => {
		const own = files.filter(({ rel }) => areaOf(rel) === area);

		test("imports stay in bounds", () => {
			const found = own.flatMap(({ file, rel }) => {
				const rules = nodeOnly?.test(rel) ? forbid : [...forbid, ...runtimeForbid];
				const names = importsOf(readFileSync(file, "utf8")).filter((s) => !s.startsWith("."));
				return violations(names, rules).map((v) => `${rel}: ${v}`);
			});
			expect(found).toEqual([]);
		});

		test("relative imports stay in the area", () => {
			const found = own.flatMap(({ file, rel }) =>
				importsOf(readFileSync(file, "utf8"))
					.filter((s) => s.startsWith("."))
					.map((s) => relative(SRC, resolve(dirname(file), s)))
					.filter((target) => {
						const to = areaOf(target);
						return to !== area && !reaches.includes(to);
					})
					.map((target) => `${rel}: ${target}`),
			);
			expect(found).toEqual([]);
		});
	},
);
