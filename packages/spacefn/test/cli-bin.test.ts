import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, expect, test } from "vite-plus/test";

import { resolveBin, runBin } from "../src/bin";

let app: string;

beforeAll(() => {
	app = realpathSync(mkdtempSync(join(tmpdir(), "space-bin-")));
	const pkg = join(app, "node_modules", "fake-tool");
	mkdirSync(pkg, { recursive: true });
	writeFileSync(
		join(pkg, "package.json"),
		JSON.stringify({ name: "fake-tool", bin: { "fake-tool": "cli.js" } }),
	);
	// Exits with the code given as the first argument, or kills itself with SIGTERM for "signal".
	writeFileSync(
		join(pkg, "cli.js"),
		`const arg = process.argv[2];
if (arg === "signal") process.kill(process.pid, "SIGTERM");
else process.exit(Number(arg));
`,
	);
});

afterAll(() => {
	rmSync(app, { recursive: true, force: true });
});

test("resolves a package's bin from the app's node_modules", () => {
	const bin = resolveBin("fake-tool", "fake-tool", join(app, "package.json"));
	expect(bin).toBe(join(app, "node_modules", "fake-tool", "cli.js"));
});

test("reports a missing package with an install hint", () => {
	expect(() => resolveBin("not-installed", "not-installed", join(app, "package.json"))).toThrow(
		"not-installed is not installed",
	);
});

test("returns the child's exit code", async () => {
	const bin = resolveBin("fake-tool", "fake-tool", join(app, "package.json"));
	expect(await runBin(bin, ["7"], app)).toBe(7);
	expect(await runBin(bin, ["0"], app)).toBe(0);
});

test("a child stopped by a signal is a failure, not success", async () => {
	const bin = resolveBin("fake-tool", "fake-tool", join(app, "package.json"));
	expect(await runBin(bin, ["signal"], app)).toBe(128 + 15);
});
