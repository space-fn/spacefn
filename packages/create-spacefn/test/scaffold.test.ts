import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { packageJson, scaffold, type Target } from "../src/scaffold.ts";

const here = fileURLToPath(new URL("..", import.meta.url));
// Inside the package, so the scaffolded app resolves spacefn from this workspace.
const scratch = join(here, ".scratch");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const bin = (name: string) => join(here, "node_modules", ".bin", name);
const space = join(here, "..", "infra", "src", "cli.ts");
const sh = (cwd: string, command: string, args: string[]) => {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	return { code: result.status, output: `${result.stdout}${result.stderr}` };
};

const create = (target: Target) => {
	const dir = join(scratch, `${target}-${Date.now()}`);
	scaffold(dir, { name: `my-${target}-app`, target });
	return dir;
};

describe("scaffold", () => {
	it("gives each target its runtime and Alchemy provider", () => {
		const cloudflare = packageJson({ name: "a", target: "cloudflare" });
		expect(Object.keys(cloudflare.dependencies)).toEqual([
			"@spacefn/cloudflare",
			"effect",
			"spacefn",
		]);
		expect(cloudflare.devDependencies).toHaveProperty("@alchemy.run/cloudflare");
		const bun = packageJson({ name: "a", target: "bun", workspace: true });
		expect(bun.dependencies).toEqual({
			"@spacefn/bun": "workspace:*",
			effect: "catalog:",
			spacefn: "workspace:*",
		});
		expect(bun.devDependencies).toHaveProperty("@alchemy.run/docker", "catalog:");
	});

	it("writes the app: .gitignore, configs/space.ts and package.json", () => {
		const dir = create("bun");
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".space/");
		expect(existsSync(join(dir, "gitignore"))).toBe(false);
		expect(readFileSync(join(dir, "configs/space.ts"), "utf8")).toContain('target: "bun"');
		expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name).toBe("my-bun-app");
		expect(() => scaffold(dir, { name: "x", target: "bun" })).toThrow("already exists");
	});
});

describe.each(["cloudflare", "bun"] as const)("a new %s app", (target) => {
	const dir = create(target);

	it("generates, typechecks and passes its own tests", () => {
		expect(sh(dir, process.execPath, [space, "gen"]).code).toBe(0);
		const types = sh(dir, bin("tsc"), ["--noEmit", "-p", "."]);
		expect(types.output).toBe("");
		const tests = sh(dir, bin("vitest"), ["run", "--config", "configs/vitest.config.ts"]);
		expect(tests.output).toContain("2 passed");
	}, 120_000);
});

describe.skipIf(spawnSync("bun", ["--version"]).status !== 0)("a new Bun app, built", () => {
	it("serves the todos page with its assets and Datastar", async () => {
		const dir = create("bun");
		expect(sh(dir, process.execPath, [space, "build"]).code).toBe(0);
		const port = 4950 + Math.floor(Math.random() * 40);
		const server = spawn("bun", [".space/dist/server/index.js"], {
			cwd: dir,
			env: { ...process.env, PORT: String(port), SPACE_DATA_DIR: join(dir, ".space", "data") },
			stdio: "ignore",
		});
		try {
			const base = `http://127.0.0.1:${port}`;
			let page = "";
			for (let i = 0; i < 50 && !page; i++) {
				page = await fetch(base).then(
					(r) => r.text(),
					() => "",
				);
				if (!page) await new Promise((r) => setTimeout(r, 100));
			}
			expect(page).toContain("<h1>Hello from spacefn</h1>");
			expect(page).toMatch(/href="\/assets\/site-[\w-]+\.css"/);
			expect(page).toContain("starfederation/datastar@1.0.5");
			const added = await fetch(`${base}/?__action=add`, {
				method: "POST",
				redirect: "manual",
				headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
				body: "title=Ship",
			});
			expect(added.status).toBe(303);
			expect(await (await fetch(base)).text()).toContain("Ship");
		} finally {
			server.kill("SIGTERM");
		}
	}, 120_000);
});

describe("the repo's playgrounds", () => {
	const files = (dir: string, prefix = ""): string[] =>
		readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
			const path = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (["node_modules", ".space", ".env"].includes(entry.name)) return [];
			return entry.isDirectory() ? files(dir, path) : [path];
		});

	it.each(["cloudflare", "bun"] as const)(
		"playground/%s is the template; run pnpm playground",
		(target) => {
			const playground = join(here, "..", "..", "playground", target);
			const fresh = join(scratch, `playground-${target}-${Date.now()}`);
			scaffold(fresh, { name: `playground-${target}`, target, workspace: true });
			expect(files(playground).sort()).toEqual(files(fresh).sort());
			for (const file of files(fresh))
				expect(readFileSync(join(playground, file), "utf8"), file).toBe(
					readFileSync(join(fresh, file), "utf8"),
				);
		},
	);
});
