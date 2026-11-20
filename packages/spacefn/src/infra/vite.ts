import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

import {
	isRunnableDevEnvironment,
	type Manifest,
	type Plugin,
	type ResolvedConfig,
	type ViteDevServer,
} from "vite";

import { DOCS_BASE, docsMismatch, loadDocs } from "./docs.ts";

export interface SpaceViteOptions {
	readonly target: "cloudflare" | "bun";
	/** The app root (where `app/` and `configs/` are). The generated config sits in `.space/`. */
	readonly root: string;
	/** Client entries, e.g. `app/client/main.ts`, relative to the root. */
	readonly client: readonly string[];
	/** Import aliases, alias → folder relative to the root. */
	readonly aliases: Readonly<Record<string, string>>;
}

/** What server code imports for the client's `<script>` and `<link>` tags. */
export const ASSETS_ID = "@space/assets";
const RESOLVED_ASSETS_ID = "\0space:assets";

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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

/** The docs reader at /__space/docs/, when the app has @spacefn/docs. */
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

/** The parts every target shares: root, aliases, output folders, assets, client-first build, reloads. */
const core = (options: SpaceViteOptions): Plugin => {
	const { root } = options;
	const space = join(root, ".space");
	const clientOut = join(space, "dist", "client");
	let config: ResolvedConfig;
	let server: ViteDevServer | undefined;
	return {
		name: "spacefn",
		config: () => ({
			// Alchemy roots Vite where the config is (.space/); the app is one level up.
			root,
			resolve: {
				alias: [
					{ find: /^@space\/(?!assets$)/, replacement: `${space}/` },
					...Object.entries(options.aliases).map(([alias, dir]) => ({
						find: new RegExp(`^${escapeRegExp(alias)}/`),
						replacement: `${join(root, dir)}/`,
					})),
				],
			},
			build: { outDir: join(space, "dist") },
			environments: {
				client: {
					build: {
						outDir: clientOut,
						emptyOutDir: true,
						manifest: true,
						...(options.client.length > 0
							? { rolldownOptions: { input: options.client.map((file) => join(root, file)) } }
							: {}),
					},
				},
			},
			server: {
				watch: {
					// Vite's watcher doesn't read .gitignore; Alchemy's log would reload pages in a loop.
					ignored: ["**/.space/.alchemy/**", "**/.space/dist/**", "**/.space/data/**"],
				},
			},
		}),
		configResolved: (resolved) => {
			config = resolved;
		},
		configureServer: async (dev) => {
			server = dev;
			if (dev.config.mode !== "test") await serveDocs(dev, root);
		},
		resolveId: (id) => (id === ASSETS_ID ? RESOLVED_ASSETS_ID : undefined),
		load: async (id) => {
			if (id !== RESOLVED_ASSETS_ID) return undefined;
			const manifest =
				config.command === "build" && options.client.length > 0
					? (JSON.parse(
							await readFile(join(clientOut, ".vite", "manifest.json"), "utf8"),
						) as Manifest)
					: undefined;
			const tags = assetTags(options.client, config.base, manifest);
			return `import { raw } from "spacefn";\nexport const head = raw(${JSON.stringify(tags)});\n`;
		},
		buildApp: {
			// The server bundles embed the client manifest, so the client goes first.
			order: "pre",
			handler: async (builder) => {
				const client = builder.environments.client;
				if (client && options.client.length > 0 && !client.isBuilt) await builder.build(client);
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
 * bundles `.space/server.ts` into `.space/dist/server/index.js`.
 */
const bun = (options: SpaceViteOptions): Plugin => {
	const { root } = options;
	const serverOut = join(root, ".space", "dist", "server");
	const require = createRequire(import.meta.url);
	return {
		name: "spacefn:bun",
		config: () => ({
			// Otherwise Vite's SPA fallback rewrites / to /index.html before the app sees it.
			appType: "custom",
			environments: {
				ssr: {
					resolve: { noExternal: true, external: NATIVE },
					build: {
						outDir: serverOut,
						emptyOutDir: true,
						minify: true,
						target: "esnext",
						rolldownOptions: {
							input: { index: join(root, ".space", "server.ts") },
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
				join(serverOut, "package.json"),
				`${JSON.stringify({ private: true, type: "module", dependencies }, null, "\t")}\n`,
			);
		},
		configureServer(server) {
			// Vitest runs Vite in test mode; the app's tests serve it themselves.
			if (server.config.mode === "test") return;
			const environment = server.environments.ssr;
			if (!environment || !isRunnableDevEnvironment(environment))
				throw new Error("spacefn: the ssr environment can't run modules in this process");
			const entry = join(root, ".space", "app.ts");
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
 * The spacefn Vite plugin. The generated `.space/vite.config.ts` adds it, so
 * apps don't configure it; their own plugins go in `configs/vite.config.ts`.
 */
export const space = (options: SpaceViteOptions): Plugin[] =>
	options.target === "bun" ? [core(options), bun(options)] : [core(options)];
