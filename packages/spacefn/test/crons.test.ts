import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test, vi } from "vite-plus/test";

import { cronConfig, defineCron, loadCronJobs } from "../src/crons";
import { dispatchScheduled } from "../src/crons/dispatch";
import { generateWorkerSource } from "../src/entry";
import { setTracer, type SpanRecord } from "../src/trace";

const records: SpanRecord[] = [];
const ctx = () => ({ waitUntil: vi.fn() });
const event = (cron: string) => ({ cron, scheduledTime: 1_700_000_000_000 });

afterEach(() => {
	setTracer(undefined);
	records.length = 0;
});

test("rejects schedules that are not five fields", () => {
	expect(() => defineCron("every minute", async () => undefined)).toThrow(
		"5-field cron expression",
	);
	expect(defineCron("0 3 * * *", async () => undefined).schedule).toBe("0 3 * * *");
});

test("config has one scheduled trigger per distinct schedule", () => {
	const config = cronConfig(["0 3 * * *", "0 3 * * *", "*/5 * * * *"]);
	expect(config.triggers).toEqual([
		expect.objectContaining({ type: "scheduled", schedule: "0 3 * * *" }),
		expect.objectContaining({ type: "scheduled", schedule: "*/5 * * * *" }),
	]);
});

test("runs only the jobs whose schedule fired", async () => {
	const nightly = vi.fn();
	const frequent = vi.fn();
	await dispatchScheduled(event("0 3 * * *"), {}, ctx(), {
		nightly: defineCron("0 3 * * *", nightly),
		frequent: defineCron("*/5 * * * *", frequent),
	});
	expect(nightly).toHaveBeenCalledTimes(1);
	expect(frequent).not.toHaveBeenCalled();
});

test("passes the event and the bindings to the job", async () => {
	const run = vi.fn();
	await dispatchScheduled(event("0 3 * * *"), { FLAG: "on" }, ctx(), {
		nightly: defineCron("0 3 * * *", run),
	});
	const [received, env] = run.mock.calls[0] ?? [];
	expect(received).toEqual(event("0 3 * * *"));
	expect((env as { FLAG: string }).FLAG).toBe("on");
});

test("a failing job does not stop the others and is rethrown", async () => {
	const healthy = vi.fn();
	const broken = defineCron("0 3 * * *", async () => {
		throw new Error("db down");
	});
	await expect(
		dispatchScheduled(event("0 3 * * *"), {}, ctx(), {
			broken,
			healthy: defineCron("0 3 * * *", healthy),
		}),
	).rejects.toThrow("1 scheduled job(s) failed");
	expect(healthy).toHaveBeenCalledTimes(1);
});

test("traces the run under a cron span with the job name", async () => {
	setTracer({ onEnd: (record) => records.push(record) });
	await dispatchScheduled(event("0 3 * * *"), {}, ctx(), {
		nightly: defineCron("0 3 * * *", async () => undefined),
	});
	const root = records.find((r) => r.name === "cron");
	const job = records.find((r) => r.name === "cron.run");
	expect(root?.attributes).toMatchObject({ "cron.schedule": "0 3 * * *", "cron.jobs": 1 });
	expect(job).toMatchObject({ parentSpanId: root?.spanId, attributes: { "cron.job": "nightly" } });
});

test("the worker entry dispatches scheduled events only when crons exist", () => {
	expect(generateWorkerSource({})).not.toContain("scheduled:");
	const source = generateWorkerSource({ crons: ["nightly.ts"] });
	expect(source).toContain('import cron0 from "../app/crons/nightly";');
	expect(source).toContain('"nightly": cron0,');
	expect(source).toContain("dispatchScheduled({ cron: controller.cron");
});

test("loads each cron file's schedule from disk", async () => {
	const root = await mkdtemp(join(tmpdir(), "space-cron-"));
	try {
		await mkdir(join(root, "app", "crons"), { recursive: true });
		await writeFile(
			join(root, "app", "crons", "nightly.ts"),
			`import { defineCron } from ${JSON.stringify(new URL("../src/crons.ts", import.meta.url).pathname)};\nexport default defineCron("0 3 * * *", async () => undefined);\n`,
		);
		const jobs = await loadCronJobs(root);
		expect(Object.keys(jobs)).toEqual(["nightly"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
