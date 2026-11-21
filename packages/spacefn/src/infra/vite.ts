import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";

import { Cause, Effect, Exit } from "effect";
import { formatSpaceError, SpaceError, type Target } from "spacefn";
import { genPlan } from "spacefn/codegen";
import {
	isRunnableDevEnvironment,
	type Manifest,
	type Plugin,
	type ResolvedConfig,
	type ViteDevServer,
} from "vite";

import { DOCS_BASE, docsMismatch, loadDocs } from "./docs.ts";
import type { SpacePluginApi } from "./vite-config.ts";

export interface SpaceViteOptions {
	/** Where the app runs: `cloudflare` (a Worker, through Alchemy) or `bun` (a server, in Docker). */
	readonly target: Target;
	/**
	 * The app root, where `package.json`, `app/` and `configs/` are. Default: the
	 * nearest folder with a `package.json`, from Vite's root (Alchemy roots Vite in `.space/`).
	 */
	readonly root?: string;
}

/** What the plugins learn once Vite starts: the app root and, from codegen, its client entries. */
interface App {
	root: string;
	/** Client entries, e.g. `app/client/main.ts`, relative to the root. */
	client: readonly string[];
}

const nearestPackage = (from: string) => {
	for (let dir = resolve(from); ; dir = dirname(dir)) {
		if (existsSync(join(dir, "package.json"))) return dir;
		if (dir === dirname(dir)) return resolve(from);
	}
};

/** Writes `.space/` before Vite resolves anything, so a plain `vite build` or `vitest` is current too. */
const generate = async (app: App, mode: "dev" | "prod", target: Target) => {
	const exit = await Effect.runPromiseExit(genPlan(app.root, mode, target));
	if (Exit.isSuccess(exit)) return exit.value.plan;
	const error = Cause.squash(exit.cause);
	throw new Error(error instanceof SpaceError ? formatSpaceError(error) : String(error));
};

/** What server code imports for the client's `<script>` and `<link>` tags. */
export const ASSETS_ID = "spacefn/assets";
const RESOLVED_ASSETS_ID = "\0space:assets";

/** What `app/entry.ts` imports for the target's services. */
export const PLATFORM_ID = "spacefn/platform";
const RESOLVED_PLATFORM_ID = "\0space:platform";

/** Packages with native code: left out of the Bun server bundle and installed beside it. */
const NATIVE = ["@libsql/client"];

/** The installed version of `name`, found from its entry since not every package exports package.json. */
const installedVersion = async (resolve: (id: string) => string, name: string) => {
	for (let dir = dirname(resolve(name)); dir !== dirname(dir); dir = dirname(dir)) {
		const manifest = await readFile(join(dir, "package.json"), "utf8").then(
			(text) => JSON.parse(text) as { name?: string; version?: string },
			() => undefined,
		);
		if (manifest?.name === name && manifest.version) return manifest.version;
	}
	throw new Error(`spacefn: can't find the installed version of ${name}`);
};

/** The tags for the client entries: their sources in dev, the hashed build files from the manifest. */
export const assetTags = (
	entries: readonly string[],
	base: string,
	manifest: Manifest | undefined,
): string => {
	if (!manifest) {
		const tags =
			entries.length > 0 ? [`<script type="module" src="${base}@vite/client"></script>`] : [];
		for (const entry of entries)
			tags.push(
				entry.endsWith(".css")
					? `<link rel="stylesheet" href="${base}${entry}">`
					: `<script type="module" src="${base}${entry}"></script>`,
			);
		return tags.join("");
	}
	const styles = new Set<string>();
	const scripts: string[] = [];
	const preloads = new Set<string>();
	const visit = (key: string, entry: boolean) => {
		const chunk = manifest[key];
		if (!chunk) return;
		if (chunk.file.endsWith(".css")) styles.add(chunk.file);
		else if (entry) scripts.push(chunk.file);
		else preloads.add(chunk.file);
		for (const css of chunk.css ?? []) styles.add(css);
		for (const imported of chunk.imports ?? []) visit(imported, false);
	};
	for (const entry of entries) visit(entry, true);
	return [
		...[...styles].map((file) => `<link rel="stylesheet" href="${base}${file}">`),
		...[...preloads].map((file) => `<link rel="modulepreload" href="${base}${file}">`),
		...scripts.map((file) => `<script type="module" src="${base}${file}"></script>`),
	].join("");
};

/** The docs reader at /__space/docs/, when the app has spacefn-docs. */
const serveDocs = async (dev: ViteDevServer, root: string) => {
	const docs = await loadDocs(root);
	if (!docs) return;
	const reader = docs.appDocs({ root, base: DOCS_BASE });
	// Before Vite's own middleware, so its fallbacks don't answer first.
	dev.middlewares.use((req, res, next) => void reader.handle(req, res, next));
	dev.httpServer?.once("close", reader.close);
	let printed = false;
	const print = (where: string) => {
		printed = true;
		dev.config.logger.info(`  ➜  Docs:    ${where}`);
		const mismatch = docsMismatch(docs);
		if (mismatch) dev.config.logger.warn(`  ${mismatch}`);
	};
	// Next to Vite's URLs when something prints them (Bun's dev server does)...
	const printUrls = dev.printUrls.bind(dev);
	dev.printUrls = () => {
		printUrls();
		const local = dev.resolvedUrls?.local[0];
		if (local) print(new URL(DOCS_BASE, local).href);
	};
	// ...else once the server listens. Alchemy serves it behind its own URL, so only the path is known.
	dev.httpServer?.once("listening", () => {
		setTimeout(() => printed || print(`${DOCS_BASE} on the app's URL`), 1_000).unref();
	});
};

/** The parts every target shares: root, output folders, assets, client-first build, reloads. */
const core = (options: SpaceViteOptions, app: App): Plugin => {
	const clientOut = () => join(app.root, "dist", "client");
	let config: ResolvedConfig;
	let server: ViteDevServer | undefined;
	return {
		name: "spacefn",
		api: { spacefn: { target: options.target } } satisfies SpacePluginApi,
		// Before Vite's resolver, which would find the real spacefn/assets (a stub) in node_modules.
		enforce: "pre",
		config: async (user, env) => {
			app.root = options.root ?? nearestPackage(user.root ?? process.cwd());
			const { root } = app;
			app.client = (
				await generate(app, env.command === "build" ? "prod" : "dev", options.target)
			).client;
			return {
				root,
				build: { outDir: join(root, "dist") },
				environments: {
					client: {
						build: {
							outDir: clientOut(),
							emptyOutDir: true,
							manifest: true,
							...(app.client.length > 0
								? { rolldownOptions: { input: app.client.map((file) => join(root, file)) } }
								: {}),
						},
					},
				},
				server: {
					watch: {
						// Vite's watcher doesn't read .gitignore; Alchemy's log would reload pages in a loop.
						ignored: [
							`${join(root, ".alchemy")}/**`,
							"**/.space/data/**",
							`${join(root, "dist")}/**`,
						],
					},
				},
			};
		},
		configResolved: (resolved) => {
			config = resolved;
		},
		configureServer: async (dev) => {
			server = dev;
			if (dev.config.mode !== "test") await serveDocs(dev, app.root);
		},
		resolveId: (id) =>
			id === ASSETS_ID ? RESOLVED_ASSETS_ID : id === PLATFORM_ID ? RESOLVED_PLATFORM_ID : undefined,
		load: async (id) => {
			// The target's platform, so app/entry.ts is the same file on both targets.
			if (id === RESOLVED_PLATFORM_ID)
				return `export { platform } from ${JSON.stringify(`spacefn/${options.target}`)};\n`;
			if (id !== RESOLVED_ASSETS_ID) return undefined;
			const manifest =
				config.command === "build" && app.client.length > 0
					? (JSON.parse(
							await readFile(join(clientOut(), ".vite", "manifest.json"), "utf8"),
						) as Manifest)
					: undefined;
			const tags = assetTags(app.client, config.base, manifest);
			return `import { raw } from "spacefn";\nexport const head = raw(${JSON.stringify(tags)});\n`;
		},
		buildApp: {
			// The server bundles embed the client manifest, so the client goes first.
			order: "pre",
			handler: async (builder) => {
				const client = builder.environments.client;
				if (client && app.client.length > 0 && !client.isBuilt) await builder.build(client);
			},
		},
		hotUpdate(update) {
			// The new server code runs on the next request; reload the page to make one.
			if (this.environment.config.consumer === "server" && update.modules.length > 0)
				server?.environments.client.hot.send({ type: "full-reload" });
		},
	};
};

// ---------------------------------------------------------------------------
// Bun

interface DevApp {
	readonly fetch: (request: Request, clientIp?: string) => Promise<Response>;
	readonly startJobs: () => () => Promise<void>;
	readonly dispose: () => Promise<void>;
}

const toRequest = (req: IncomingMessage, origin: string): Request => {
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers))
		if (value !== undefined && !name.startsWith(":"))
			for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
	const method = req.method ?? "GET";
	const controller = new AbortController();
	req.once("close", () => req.complete || controller.abort());
	return new Request(new URL(req.originalUrl ?? req.url ?? "/", origin), {
		method,
		headers,
		signal: controller.signal,
		...(method === "GET" || method === "HEAD"
			? {}
			: { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }),
	} as RequestInit);
};

const send = async (res: ServerResponse, response: Response) => {
	res.statusCode = response.status;
	for (const [name, value] of response.headers)
		if (name !== "set-cookie") res.setHeader(name, value);
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
	if (!response.body) return void res.end();
	res.flushHeaders();
	const reader = response.body.getReader();
	res.once("close", () => void reader.cancel().catch(() => {}));
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		res.write(value);
	}
	res.end();
};

declare module "node:http" {
	interface IncomingMessage {
		originalUrl?: string;
	}
}

/**
 * Bun: the dev server answers with `.space/app.ts`, loaded through the `ssr`
 * environment so server edits apply on the next request, and runs its queues
 * and crons in-process (production gives them their own processes). A build
 * bundles `.space/server.ts` into `dist/server/index.js`.
 */
const bun = (app: App): Plugin => {
	const serverOut = () => join(app.root, "dist", "server");
	const require = createRequire(import.meta.url);
	return {
		name: "spacefn:bun",
		// After core's config hook, which finds the root.
		config: () => ({
			// Otherwise Vite's SPA fallback rewrites / to /index.html before the app sees it.
			appType: "custom",
			environments: {
				ssr: {
					resolve: { noExternal: true, external: NATIVE },
					build: {
						outDir: serverOut(),
						emptyOutDir: true,
						minify: true,
						target: "esnext",
						rolldownOptions: {
							input: { index: join(app.root, ".space", "server.ts") },
							external: NATIVE,
						},
					},
				},
			},
			builder: {},
		}),
		buildApp: {
			// A `pre` buildApp hook makes Vite skip the rest; build whatever is left.
			order: "post",
			handler: async (builder) => {
				for (const environment of Object.values(builder.environments))
					if (!environment.isBuilt) await builder.build(environment);
			},
		},
		async writeBundle() {
			if (this.environment.name !== "ssr") return;
			// The native packages the bundle leaves out, for `bun install` in the image.
			const dependencies: Record<string, string> = {};
			for (const name of NATIVE) dependencies[name] = await installedVersion(require.resolve, name);
			await writeFile(
				join(serverOut(), "package.json"),
				`${JSON.stringify({ private: true, type: "module", dependencies }, null, "\t")}\n`,
			);
		},
		configureServer(server) {
			// Vitest runs Vite in test mode; the app's tests serve it themselves.
			if (server.config.mode === "test") return;
			const environment = server.environments.ssr;
			if (!environment || !isRunnableDevEnvironment(environment))
				throw new Error("spacefn: the ssr environment can't run modules in this process");
			const entry = join(app.root, ".space", "app.ts");
			let current: { module: unknown; app: DevApp; stopJobs: () => Promise<void> } | undefined;
			let loading: Promise<DevApp> | undefined;
			const load = (): Promise<DevApp> =>
				(loading ??= (async () => {
					try {
						const module = (await environment.runner.import(entry)) as { default: DevApp };
						if (current?.module === module) return current.app;
						const previous = current;
						current = { module, app: module.default, stopJobs: module.default.startJobs() };
						if (previous) {
							await previous.stopJobs();
							await previous.app.dispose();
						}
						return current.app;
					} finally {
						loading = undefined;
					}
				})());
			server.watcher.on("change", () => {
				// Pick the edit up in the jobs too, not only on the next request.
				setTimeout(() => void load().catch(() => {}), 100);
			});
			server.httpServer?.once(
				"listening",
				() => void load().catch((error) => console.error(error)),
			);
			server.httpServer?.once("close", () => {
				void current?.stopJobs().then(() => current?.app.dispose());
			});
			// After Vite's own middleware, so /@vite/client and source files are served first.
			return () => {
				server.middlewares.use((req, res, next) => {
					const origin = `http://${req.headers.host ?? "localhost"}`;
					load()
						.then((app) => app.fetch(toRequest(req, origin), req.socket.remoteAddress))
						.then((response) => send(res, response))
						.catch((error) => {
							server.ssrFixStacktrace(error as Error);
							next(error);
						});
				});
			};
		},
	};
};

/**
 * The spacefn Vite plugin, for the app's `configs/vite.ts`. When Vite starts
 * it writes `.space/` from `app/`, then serves and builds the app for `target`.
 *
 * ```ts
 * export default defineConfig({ plugins: [space({ target: "cloudflare" })] });
 * ```
 */
export const space = (options: SpaceViteOptions): Plugin[] => {
	const app: App = { root: options.root ?? process.cwd(), client: [] };
	return options.target === "bun" ? [core(options, app), bun(app)] : [core(options, app)];
};
