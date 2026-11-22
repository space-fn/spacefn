import { spawnSync } from "node:child_process";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";

import { run } from "../../src/infra/process.ts";

const running = (marker: string) =>
	spawnSync("pgrep", ["-f", marker], { encoding: "utf8" }).stdout.trim();

describe.skipIf(process.platform === "win32")("run", () => {
	it.live("stops the whole tree on interrupt, even what the child doesn't pass signals to", () =>
		Effect.gen(function* () {
			// Like `alchemy dev`: a parent that starts a child and doesn't forward SIGTERM to it.
			const marker = `${300 + Math.random()}`;
			const script = `require("node:child_process").spawn("sleep", ["${marker}"], { stdio: "ignore" }); setInterval(() => {}, 1000);`;
			const fiber = yield* run(process.execPath, ["-e", script], {
				cwd: process.cwd(),
				stdio: "ignore",
				killAfterMs: 2_000,
			}).pipe(Effect.forkChild);
			for (let i = 0; i < 50 && !running(marker); i++) yield* Effect.sleep("100 millis");
			expect(running(marker)).not.toBe("");
			yield* Fiber.interrupt(fiber);
			expect(running(marker)).toBe("");
		}),
	);

	it.effect("gives the exit code", () =>
		Effect.gen(function* () {
			const code = yield* run(process.execPath, ["-e", "process.exit(3)"], { cwd: process.cwd() });
			expect(code).toBe(3);
		}),
	);
});
