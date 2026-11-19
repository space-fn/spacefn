// Architecture rules: the core never imports a runtime, and each target stays in its lane.
// Checks both package.json dependency fields and every import in src/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, test } from "vitest";

const PACKAGES = resolve(import.meta.dirname, "../..");

type Rule = { readonly name: string; readonly pattern: RegExp };

const rule = (name: string, pattern: RegExp): Rule => ({ name, pattern });

const ALCHEMY = rule("alchemy", /^(alchemy|@alchemy\.run\/.*)(\/.*)?$/);
const CLOUDFLARE = rule(
	"cloudflare",
	/^(cloudflare:.*|@cloudflare\/.*|@spacefn\/cloudflare(\/.*)?|@effect\/sql-d1|@effect\/sql-sqlite-do)$/,
);
const BUN = rule(
	"bun",
	/^(bun|bun:.*|@types\/bun|@spacefn\/bun(\/.*)?|@effect\/platform-bun|@effect\/sql-sqlite-bun)$/,
);
const PLATFORM = rule("@effect/platform-*", /^@effect\/platform-.*$/);
const INFRA = rule("@spacefn/infra", /^@spacefn\/infra(\/.*)?$/);
const EFFECT = rule("effect", /^(effect|@effect\/.*)(\/.*)?$/);
const NODE = rule("node builtins", /^node:.*$/);

/** Files in the core that only ever run in Node (CLI, codegen), so they may use node:* builtins. */
const CORE_NODE_ONLY = /^src\/(cli(\.ts|\/)|codegen\/)/;

const BOUNDARIES: Record<
	string,
	{ forbid: Rule[]; runtimeForbid?: Rule[]; runtimeExempt?: RegExp }
> = {
	sql: { forbid: [ALCHEMY, CLOUDFLARE, BUN, PLATFORM, INFRA, EFFECT, NODE] },
	spacefn: {
		forbid: [ALCHEMY, CLOUDFLARE, BUN, PLATFORM, INFRA],
		runtimeForbid: [NODE],
		runtimeExempt: CORE_NODE_ONLY,
	},
	cloudflare: {
		forbid: [ALCHEMY, BUN, INFRA, rule("@effect/platform-node", /^@effect\/platform-node$/)],
	},
	bun: {
		forbid: [ALCHEMY, CLOUDFLARE, INFRA, rule("@effect/platform-node", /^@effect\/platform-node$/)],
	},
	infra: { forbid: [] },
};

export const importsOf = (source: string): string[] => {
	const found = new Set<string>();
	const patterns = [
		/\b(?:import|export)\s[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
		/\bimport\s*["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) for (const m of source.matchAll(pattern)) found.add(m[1]!);
	return [...found].filter((s) => !s.startsWith("."));
};

const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(c|m)?tsx?$/.test(entry) ? [path] : [];
	});

const dependencyNames = (pkgDir: string): string[] => {
	const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
	return ["dependencies", "peerDependencies", "optionalDependencies"].flatMap((field) =>
		Object.keys(pkg[field] ?? {}),
	);
};

const violations = (names: readonly string[], rules: readonly Rule[]) =>
	names.flatMap((name) =>
		rules.filter((r) => r.pattern.test(name)).map((r) => `${name} (${r.name})`),
	);

describe("importsOf", () => {
	test("finds static, side-effect, dynamic and require imports, skipping relative ones", () => {
		const source = [
			`import { a } from "effect";`,
			`import type { B } from "@cloudflare/workers-types";`,
			`export * from "./local.ts";`,
			`import "bun:sqlite";`,
			`const m = await import("alchemy");`,
			`const n = require("node:fs");`,
			`import {\n  multi,\n  line,\n} from "@effect/platform-bun";`,
		].join("\n");
		expect(importsOf(source).sort()).toEqual(
			[
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

describe.each(Object.entries(BOUNDARIES))(
	"@spacefn %s boundaries",
	(dir, { forbid, runtimeForbid = [], runtimeExempt }) => {
		const pkgDir = join(PACKAGES, dir);

		test("package.json dependencies stay in bounds", () => {
			expect(violations(dependencyNames(pkgDir), [...forbid, ...runtimeForbid])).toEqual([]);
		});

		test("src imports stay in bounds", () => {
			const found = sourceFiles(join(pkgDir, "src")).flatMap((file) => {
				const rel = relative(pkgDir, file);
				const rules = runtimeExempt?.test(rel) ? forbid : [...forbid, ...runtimeForbid];
				return violations(importsOf(readFileSync(file, "utf8")), rules).map((v) => `${rel}: ${v}`);
			});
			expect(found).toEqual([]);
		});
	},
);

test("rules cover every new package", () => {
	const legacyOrTooling = new Set(["create-spacefn", "vscode-spacefn"]);
	const dirs = readdirSync(PACKAGES).filter(
		(d) => !legacyOrTooling.has(d) && statSync(join(PACKAGES, d)).isDirectory(),
	);
	expect(dirs.sort()).toEqual(Object.keys(BOUNDARIES).sort());
});
