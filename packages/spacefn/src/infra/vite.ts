import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import { Cause, Effect, Exit } from "effect";
import { formatSpaceError, SpaceError, type Target } from "spacefn";
import { assetEntryName, genPlan } from "spacefn/internal/codegen";
import {
	isRunnableDevEnvironment,
	parseSync,
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

/** What the plugins learn once Vite starts: the app root and, from codegen, its `app/assets/` entries. */
interface App {
	root: string;
	/** The browser's entries, e.g. `app/assets/main.ts`, relative to the root. */
	assets: readonly string[];
	/** `*.island.*` files, entries of their own; codegen found them, a build bundles them. */
	islands: readonly string[];
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

/** What an island file imports for `island(...)`; the plugin gives each one its own copy. */
export const ISLAND_ID = "spacefn/island";
const RESOLVED_ISLAND_ID = "\0space:island:";
const ISLAND_FILE = /\.island\.[cm]?[jt]sx?$/;

/**
 * `spacefn/island` for one island file. In the browser it starts the
 * component; on the server it renders the element and the file's tags, each
 * through `once`, so a page with many of them loads the file once.
 */
export const islandModule = (consumer: "client" | "server", tags: readonly string[]): string =>
	consumer === "client"
		? 'export { clientIsland as island } from "spacefn/internal/island/client";\n'
		: `import { serverIsland } from "spacefn/internal/island/server";
export const island = serverIsland(${JSON.stringify(tags)});
`;

interface Node {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
	typeof value === "object" && value !== null && typeof (value as Node).type === "string";

const visit = (node: unknown, each: (node: Node) => void): void => {
	if (Array.isArray(node)) for (const item of node) visit(item, each);
	else if (isNode(node)) {
		each(node);
		for (const value of Object.values(node)) if (typeof value === "object") visit(value, each);
	}
};

/**
 * An island file as the server runs it: without its imports, other than
 * `spacefn/island` and types, and with `null` for each `island(...)`'s start.
 * The browser code is never run on the server, where `react-dom/client` and
 * the like would fail, so an island file holds only island declarations.
 */
export const serverIslandSource = (code: string, file: string): string => {
	const { program } = parseSync(file, code) as unknown as { program: { body: readonly Node[] } };
	const edits: { start: number; end: number; text: string }[] = [];
	const names = new Set<string>();
	for (const node of program.body) {
		if (node.type !== "ImportDeclaration" || node.importKind === "type") continue;
		if ((node.source as { value: string }).value !== ISLAND_ID) {
			edits.push({ start: node.start, end: node.end, text: "" });
			continue;
		}
		for (const specifier of node.specifiers as readonly Node[])
			if ((specifier.imported as { name?: string } | undefined)?.name === "island")
				names.add((specifier.local as { name: string }).name);
	}
	visit(program.body, (node) => {
		if (node.type !== "CallExpression") return;
		const callee = node.callee as Node & { name?: string };
		const start = (node.arguments as readonly Node[])[1];
		if (callee.type === "Identifier" && names.has(callee.name ?? "") && start)
			edits.push({ start: start.start, end: start.end, text: "null" });
	});
	let out = code;
	for (const { start, end, text } of edits.sort((a, b) => b.start - a.start))
		out = out.slice(0, start) + text + out.slice(end);
	return out;
};

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

/** Where the dev head's inline scripts are served, as one module the browser runs once. */
export const DEV_HEAD_URL = "@spacefn/dev-head.js";
const RESOLVED_DEV_HEAD_ID = "\0space:dev-head";

/**
 * The tags plugins put in a page's `<head>` in dev: Vite's client, and others
 * such as React's refresh preamble. Asked of Vite with a blank page, since
 * spacefn's pages aren't HTML files that Vite transforms. Inline module scripts
 * become one module at {@link DEV_HEAD_URL}, so a page that calls `assets(...)`
 * more than once still runs them once, before its entries.
 */
export const devHead = (page: string, base: string): { tags: string; code: string } => {
	const head = /<head>([\s\S]*)<\/head>/.exec(page)?.[1] ?? "";
	const inline: string[] = [];
	const tags = head
		.replace(/<script type="module">([\s\S]*?)<\/script>/g, (_, code: string) => {
			inline.push(code.trim());
			return inline.length === 1
				? `<script type="module" src="${base}${DEV_HEAD_URL}"></script>`
				: "";
		})
		.trim();
	return { tags, code: inline.join("\n") };
};

/**
 * One asset entry's tags, in load order: in dev, the plugins' {@link devHead}
 * and then the source; in a build, its CSS, the chunks it imports and the
 * script, from the manifest.
 */
export const entryTags = (
	entry: string,
	base: string,
	manifest: Manifest | undefined,
	head = `<script type="module" src="${base}@vite/client"></script>`,
): string[] => {
	if (!manifest)
		return [
			head,
			entry.endsWith(".css")
				? `<link rel="stylesheet" href="${base}${entry}">`
				: `<script type="module" src="${base}${entry}"></script>`,
		];
	const styles = new Set<string>();
	const preloads = new Set<string>();
	let script: string | undefined;
	const visit = (key: string, top: boolean) => {
		const chunk = manifest[key];
		if (!chunk) return;
		if (chunk.file.endsWith(".css")) styles.add(chunk.file);
		else if (top) script = chunk.file;
		else preloads.add(chunk.file);
		for (const css of chunk.css ?? []) styles.add(css);
		for (const imported of chunk.imports ?? []) visit(imported, false);
	};
	visit(entry, true);
	return [
		...[...styles].map((file) => `<link rel="stylesheet" href="${base}${file}">`),
		...[...preloads].map((file) => `<link rel="modulepreload" href="${base}${file}">`),
		...(script ? [`<script type="module" src="${base}${script}"></script>`] : []),
	];
};

/** `spacefn/assets` for the app: `assets(...names)` joins those entries' tags, each tag once. */
export const assetsModule = (tags: Readonly<Record<string, readonly string[]>>): string =>
	`import { html, once, raw } from "spacefn";
const tags = ${JSON.stringify(tags)};
export const assets = (...names) => {
	const seen = new Set();
	for (const name of names) {
		const entry = Object.hasOwn(tags, name) ? tags[name] : undefined;
		if (!entry) throw new Error(\`spacefn/assets: there's no entry "\${name}"; the entries are app/assets/'s files: \${Object.keys(tags).join(", ") || "none"}\`);
		for (const tag of entry) seen.add(tag);
	}
	// Each through once, so islands' tags and other assets(...) calls don't repeat them.
	return html\`\${[...seen].map((tag) => once(raw(tag)))}\`;
};
`;

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
	let head: Promise<{ tags: string; code: string }> | undefined;
	const headOf = (dev: ViteDevServer) =>
		(head ??= dev
			.transformIndexHtml("/", "<html><head></head><body></body></html>")
			.then((page) => devHead(page, config.base)));
	/** The client build's manifest after a build; in dev, the plugins' head tags instead. */
	const built = async () => {
		const manifest =
			config.command === "build" && app.assets.length + app.islands.length > 0
				? (JSON.parse(
						await readFile(join(clientOut(), ".vite", "manifest.json"), "utf8"),
					) as Manifest)
				: undefined;
		const tags = !manifest && server ? (await headOf(server)).tags : undefined;
		return { manifest, tags };
	};
	return {
		name: "spacefn",
		api: { spacefn: { target: options.target } } satisfies SpacePluginApi,
		// Before Vite's resolver, which would find the real spacefn/assets (a stub) in node_modules.
		enforce: "pre",
		config: async (user, env) => {
			app.root = options.root ?? nearestPackage(user.root ?? process.cwd());
			const { root } = app;
			const plan = await generate(app, env.command === "build" ? "prod" : "dev", options.target);
			app.assets = plan.assets;
			app.islands = plan.islands;
			const inputs = [...app.assets, ...app.islands];
			return {
				root,
				// Served as they are at /, before the app, and copied into the client build.
				publicDir: join(root, "public"),
				build: { outDir: join(root, "dist") },
				environments: {
					client: {
						build: {
							outDir: clientOut(),
							emptyOutDir: true,
							manifest: true,
							...(inputs.length > 0
								? { rolldownOptions: { input: inputs.map((file) => join(root, file)) } }
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
		// public/ belongs with the client build only, not in the server bundles.
		configEnvironment: (name) =>
			name === "client" ? undefined : { build: { copyPublicDir: false } },
		configResolved: (resolved) => {
			config = resolved;
		},
		configureServer: async (dev) => {
			server = dev;
			if (dev.config.mode !== "test") await serveDocs(dev, app.root);
		},
		resolveId: (id, importer) => {
			if (id === ASSETS_ID) return RESOLVED_ASSETS_ID;
			if (id === PLATFORM_ID) return RESOLVED_PLATFORM_ID;
			if (id === `/${DEV_HEAD_URL}`) return RESOLVED_DEV_HEAD_ID;
			// By the file's name, not codegen's list, so an island added in dev works at once.
			const file = importer?.split("?")[0];
			if (id === ISLAND_ID && file && ISLAND_FILE.test(file))
				return `${RESOLVED_ISLAND_ID}${relative(app.root, file).split(sep).join("/")}`;
			return undefined;
		},
		async load(id) {
			// The target's platform, so app/entry.ts is the same file on both targets.
			if (id === RESOLVED_PLATFORM_ID)
				return `export { platform } from ${JSON.stringify(`spacefn/${options.target}`)};\n`;
			if (id === RESOLVED_DEV_HEAD_ID) return server ? (await headOf(server)).code : "";
			if (id.startsWith(RESOLVED_ISLAND_ID)) {
				const consumer = this.environment.config.consumer;
				if (consumer === "client") return islandModule("client", []);
				const { manifest, tags } = await built();
				return islandModule(
					"server",
					entryTags(id.slice(RESOLVED_ISLAND_ID.length), config.base, manifest, tags),
				);
			}
			if (id !== RESOLVED_ASSETS_ID) return undefined;
			const { manifest, tags } = await built();
			return assetsModule(
				Object.fromEntries(
					app.assets.map((file) => [
						assetEntryName(file),
						entryTags(file, config.base, manifest, tags),
					]),
				),
			);
		},
		transform(code, id) {
			const file = id.split("?")[0]!;
			if (this.environment.config.consumer === "client" || !ISLAND_FILE.test(file)) return;
			if (id.includes("\0")) return;
			return { code: serverIslandSource(code, file), map: null };
		},
		buildApp: {
			// The server bundles embed the client manifest, so the client goes first.
			order: "pre",
			handler: async (builder) => {
				const client = builder.environments.client;
				if (client && app.assets.length + app.islands.length > 0 && !client.isBuilt)
					await builder.build(client);
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
			: { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: "half" }),
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
	const app: App = { root: options.root ?? process.cwd(), assets: [], islands: [] };
	return options.target === "bun" ? [core(options, app), bun(app)] : [core(options, app)];
};
