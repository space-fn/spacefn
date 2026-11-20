import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as docsPackage from "@spacefn/docs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { alchemyArgs } from "../../src/infra/alchemy.ts";
import { clean } from "../../src/infra/clean.ts";
import type { DocsModule } from "../../src/infra/docs.ts";
import { doctor, formatChecks } from "../../src/infra/doctor.ts";
import { addCommand, detectPackageManager } from "../../src/infra/package-manager.ts";
import { providerUpgrades, spacefnUpgrades } from "../../src/infra/upgrade.ts";
import { fixtureApp } from "./fixture.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "space-cli-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const touch = async (file: string, body = "") => {
	await mkdir(join(root, file, ".."), { recursive: true });
	await writeFile(join(root, file), body);
};

describe("alchemyArgs", () => {
	it("runs dev on your stage with .env, and deploys to prod with .env.<stage> only", async () => {
		expect(alchemyArgs(root, "dev")).toEqual(["dev", "alchemy.run.ts"]);
		await touch(".env");
		await touch(".env.staging");
		expect(alchemyArgs(root, "dev")).toEqual(["dev", "alchemy.run.ts", "--env-file", "../.env"]);
		expect(alchemyArgs(root, "deploy")).toEqual(["deploy", "alchemy.run.ts", "--stage", "prod"]);
		expect(alchemyArgs(root, "deploy", { stage: "staging", yes: true })).toEqual([
			"deploy",
			"alchemy.run.ts",
			"--stage",
			"staging",
			"--env-file",
			"../.env.staging",
			"--yes",
			"--no-input",
		]);
	});
});

describe("package managers", () => {
	it("follows the nearest lockfile, up through a workspace", async () => {
		expect(detectPackageManager(join(root, "app"))).not.toBe("pnpm");
		await touch("pnpm-lock.yaml");
		await touch("app/package.json", "{}");
		expect(detectPackageManager(join(root, "app"))).toBe("pnpm");
		await touch("app/bun.lock");
		expect(detectPackageManager(join(root, "app"))).toBe("bun");
		expect(addCommand("npm", ["a@1"], true)).toEqual(["npm", "install", "--save-dev", "a@1"]);
		expect(addCommand("bun", ["a@1"], false)).toEqual(["bun", "add", "a@1"]);
	});

	it("upgrades spacefn to latest, then the provider and docs to what spacefn expects", () => {
		const app = {
			dependencies: { spacefn: "^0.11.0", effect: "^4.1.4" },
			devDependencies: { "@alchemy.run/docker": "2.0.0-beta.80", "@spacefn/docs": "^0.11.0" },
		};
		expect(spacefnUpgrades("pnpm", app)).toEqual([["pnpm", "add", "spacefn@latest"]]);
		const spacefn = {
			version: "0.12.0",
			peerDependencies: { "@alchemy.run/docker": "2.0.0-beta.90" },
		};
		expect(providerUpgrades("pnpm", app, spacefn)).toEqual([
			["pnpm", "add", "-D", "@alchemy.run/docker@2.0.0-beta.90", "@spacefn/docs@0.12.0"],
		]);
	});
});

describe("docs", () => {
	it("loads with the API spacefn expects of @spacefn/docs", () => {
		// spacefn imports it at runtime only, so this keeps the two in step.
		const docs: DocsModule = docsPackage;
		expect(typeof docs.serve).toBe("function");
	});
});

describe("clean", () => {
	it("removes generated files and builds, never deploy state or local data", async () => {
		for (const file of [
			"manifest.ts",
			"db/main.ts",
			"dist/server/index.js",
			".alchemy/state/x",
			"data/main.db",
		])
			await touch(`.space/${file}`);
		expect(await clean(root)).toEqual(["db", "dist", "manifest.ts"]);
		expect((await readdir(join(root, ".space"))).sort()).toEqual([".alchemy", "data"]);
		expect(await clean(join(root, "missing"))).toEqual([]);
	});
});

describe("doctor", () => {
	it("checks the app, .space/, the provider and the env", async () => {
		const app = await fixtureApp("cloudflare-app");
		try {
			const checks = await doctor(app.root);
			const text = formatChecks(checks);
			expect(text).toContain("✓ configs/space.ts and app/ check out (target cloudflare)");
			expect(text).toContain("✓ .space/ is up to date");
			expect(text).toContain("✓ @alchemy.run/cloudflare is installed");
			// The fixture's .env doesn't exist, so GREETING is missing.
			expect(text).toMatch(/! app\/env.ts doesn't read in dev .*GREETING/);
		} finally {
			await app.cleanup();
		}
	});

	it("fails readably when there is no app", async () => {
		const checks = await doctor(root);
		expect(checks.at(-1)).toMatchObject({ level: "fail" });
		expect(checks.at(-1)!.message).toContain("configs/space.ts");
	});
});
