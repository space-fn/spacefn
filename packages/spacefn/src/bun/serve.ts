import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { Cause, Effect, Exit, Fiber, Layer } from "effect";
import type { SpaceApp } from "spacefn";
import { StaticFiles } from "spacefn/internal/runtime";

import { bunApp, logError, type BunApp } from "./app.ts";
import { runCrons } from "./cron.ts";
import { consumeQueues } from "./queue.ts";

/** Which part of the app a process runs: `web`, `queues` or `crons`. Unset: web, plus the others as child processes. */
export const ROLE_VAR = "SPACE_ROLE";

export interface ServeOptions {
	/** The client build, for the entry's `staticFiles()`. Default `dist/client`. */
	readonly client?: string;
}

/** Builds the app's services (and migrates its databases); exits with a readable error if it can't. */
const start = async (app: BunApp) => {
	try {
		await app.runtime.runPromise(Effect.void);
	} catch (error) {
		logError(error);
		process.exit(1);
	}
};

const onStop = (stop: () => Promise<void>) => {
	let stopping: Promise<void> | undefined;
	const once = () => {
		stopping ??= stop().then(
			() => process.exit(0),
			(error) => {
				logError(error);
				process.exit(1);
			},
		);
	};
	process.on("SIGTERM", once);
	process.on("SIGINT", once);
	// A child whose parent died has nobody left to answer to.
	process.on("disconnect", once);
};

/**
 * Runs `role` in a child process of this one, restarting it with backoff when
 * it exits, so a crashing consumer or job never takes the web server down.
 */
const supervise = (role: "queues" | "crons") => {
	let child: ChildProcess | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopping = false;
	let delay = 1_000;
	const run = () => {
		const startedAt = Date.now();
		child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
			env: { ...process.env, [ROLE_VAR]: role },
			stdio: ["inherit", "inherit", "inherit", "ipc"],
		});
		child.on("exit", (code, signal) => {
			if (stopping) return;
			if (Date.now() - startedAt > 60_000) delay = 1_000;
			console.error(
				`The ${role} process exited (${signal ?? code}); restarting in ${delay / 1000}s`,
			);
			timer = setTimeout(run, delay);
			delay = Math.min(delay * 2, 30_000);
		});
	};
	run();
	return {
		stop: () =>
			new Promise<void>((done) => {
				stopping = true;
				clearTimeout(timer);
				if (!child || child.exitCode !== null || child.signalCode !== null) return done();
				child.once("exit", () => done());
				child.kill("SIGTERM");
			}),
	};
};

/** A file of the client build, or undefined to let the app answer. Hashed `/assets/` are cached for good. */
const staticFile = async (
	root: string,
	method: string,
	url: string,
): Promise<Response | undefined> => {
	if (method !== "GET" && method !== "HEAD") return undefined;
	let pathname: string;
	try {
		pathname = decodeURIComponent(url);
	} catch {
		return undefined;
	}
	const path = resolve(root, `.${pathname}`);
	if (!path.startsWith(root + sep)) return undefined;
	const info = await stat(path).catch(() => undefined);
	if (!info?.isFile()) return undefined;
	const file = Bun.file(path);
	return new Response(method === "HEAD" ? null : file, {
		headers: {
			"content-type": file.type,
			"content-length": String(info.size),
			"cache-control": pathname.startsWith("/assets/")
				? "public, max-age=31536000, immutable"
				: "no-cache",
		},
	});
};

const serveWeb = async (app: BunApp, children: ("queues" | "crons")[]) => {
	await start(app);
	const { options } = app;
	const server = Bun.serve({
		port: options.port ?? Number(process.env.PORT ?? 3000),
		hostname: options.hostname ?? process.env.HOST ?? "0.0.0.0",
		// Bun's default of 10s would cut live pages, whose keepalive comes every 15s.
		idleTimeout: options.idleTimeout ?? 60,
		fetch: (request, server) => app.fetch(request, server.requestIP(request)?.address),
	});
	console.log(`${app.manifest.name} is listening on ${server.url}`);
	const supervised = children.map(supervise);
	onStop(async () => {
		await Promise.all([server.stop(), ...supervised.map((child) => child.stop())]);
		await app.dispose();
	});
};

const runJobs = async (app: BunApp, program: Effect.Effect<unknown, unknown, any>) => {
	await start(app);
	let stopping = false;
	const fiber = app.runtime.runFork(program);
	fiber.addObserver((exit) => {
		if (stopping || !Exit.isFailure(exit)) return;
		logError(Cause.squash(exit.cause));
		process.exit(1);
	});
	onStop(async () => {
		stopping = true;
		await Effect.runPromise(Fiber.interrupt(fiber));
		await app.dispose();
	});
};

/**
 * Runs `app/entry.ts` in production: what `.space/server.ts` calls. By default this
 * process serves HTTP (with the client build for `staticFiles()`) and starts the queue
 * consumers and the crons in child processes, so a slow or crashing job never
 * blocks a request. Set `SPACE_ROLE` to `web`, `queues` or `crons` to run one
 * part per process or container instead; run crons in one only. SIGTERM stops
 * everything gracefully.
 */
export const serve = (space: SpaceApp, options: ServeOptions = {}): Promise<void> => {
	const root = resolve(options.client ?? "dist/client");
	const app = bunApp(
		space,
		Layer.succeed(StaticFiles, { lookup: (method, path) => staticFile(root, method, path) }),
	);
	const role = process.env[ROLE_VAR];
	switch (role) {
		case undefined:
		case "":
			return serveWeb(app, [
				...(app.manifest.queues.length > 0 ? (["queues"] as const) : []),
				...(app.manifest.crons.length > 0 ? (["crons"] as const) : []),
			]);
		case "web":
			return serveWeb(app, []);
		case "queues":
			return runJobs(app, consumeQueues(app.manifest));
		case "crons":
			return runJobs(app, runCrons(app.manifest));
		default:
			console.error(`Unknown ${ROLE_VAR} "${role}". Use web, queues or crons.`);
			process.exit(1);
	}
};
