import { expect, test } from "vite-plus/test";

import { generateWorkerSource } from "../src/entry";
import { defineEnv, string } from "../src/env";
import { env } from "../src/env";
import { runWithEnv } from "../src/runtime";

test("env is readable after an await inside a queue or cron run", async () => {
	const schema = defineEnv({ GREETING: string() });
	await runWithEnv(schema, { GREETING: "hello" }, async () => {
		await Promise.resolve();
		expect((env as { GREETING: string }).GREETING).toBe("hello");
	});
});

test("the worker wraps queue and cron runs with the env schema", () => {
	const source = generateWorkerSource({ queues: ["emails.ts"], crons: ["nightly.ts"] });
	expect(source).toContain("let envSchema: Schema | undefined;");
	expect(source).toContain("runWithEnv(envSchema, env as object, () =>");
	expect(source).toContain("envSchema = options?.env;");
});
