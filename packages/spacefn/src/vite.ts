import { join, resolve, sep } from "node:path";

import { cloudflare, type PluginConfig } from "@cloudflare/vite-plugin";
import type { Plugin, PluginOption } from "vite";

import { envBindings } from "./cloudflare";
import { cronConfig } from "./crons/config";
import { loadCronJobs } from "./crons/load";
import { durableObjectsConfig } from "./durable-objects/config";
import type { Schema } from "./env/fields";
import { loadEnvSchema } from "./env/load";
import { queueConfig } from "./queues/config";
import type { Mode } from "./routes/scan";
import { scanCodeFiles } from "./scan";
import { sync } from "./sync";
import { workflowsConfig } from "./workflows/config";

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(md: string): string {
	const lines = md.split(/\r?\n/);
	const out: string[] = [];
	let inCode = false;
	let codeBuf: string[] = [];
	let listBuf: string[] = [];
	const flushList = () => {
		if (listBuf.length) {
			out.push("<ul>" + listBuf.map((l) => `<li>${inline(l)}</li>`).join("") + "</ul>");
			listBuf = [];
		}
	};
	const flushCode = () => {
		if (codeBuf.length) {
			out.push(`<pre><code>${escapeHtml(codeBuf.join("\\n"))}</code></pre>`);
			codeBuf = [];
		}
	};
	for (const line of lines) {
		if (line.startsWith("```")) {
			if (inCode) {
				flushCode();
				inCode = false;
			} else {
				flushList();
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			codeBuf.push(line);
			continue;
		}
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			flushList();
			const level = h[1]!.length;
			out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
			continue;
		}
		if (/^---+$/.test(line.trim())) {
			flushList();
			out.push("<hr>");
			continue;
		}
		if (/^\s*[-*]\s+/.test(line)) {
			listBuf.push(line.replace(/^\s*[-*]\s+/, ""));
			continue;
		}
		if (line.trim() === "") {
			flushList();
			continue;
		}
		flushList();
		out.push(`<p>${inline(line)}</p>`);
	}
	flushList();
	flushCode();
	return out.join("\\n");
}

function inline(s: string): string {
	return escapeHtml(s)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/\*([^*]+)\*/g, "<em>$1</em>")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export interface SpaceState {
	/** The schema from `env.ts`, loaded when Vite resolves its config. */
	envSchema?: Schema;
	/** Files in `queues/`, loaded when Vite resolves its config. */
	queueFiles?: string[];
	/** Schedules declared by `crons/`, read when Vite resolves its config. */
	cronSchedules?: string[];
	/** Files in `durable-objects/`. */
	durableObjectFiles?: string[];
	/** Files in `workflows/`. */
	workflowFiles?: string[];
}

/** Keeps `.space/` in step with the project's convention folders. */
export function spaceSync(state: SpaceState = {}): Plugin {
	let root = process.cwd();
	let mode: Mode = "dev";

	return {
		name: "space",

		async config(userConfig, env) {
			root = resolve(userConfig.root ?? process.cwd());
			mode = env.command === "serve" ? "dev" : "prod";
			state.envSchema = await loadEnvSchema(root);
			state.queueFiles = await scanCodeFiles(join(root, "queues"));
			state.cronSchedules = Object.values(await loadCronJobs(root)).map((job) => job.schedule);
			state.durableObjectFiles = await scanCodeFiles(join(root, "app", "durable-objects"));
			state.workflowFiles = await scanCodeFiles(join(root, "app", "workflows"));
			await sync(root, mode);
		},

		configureServer(server) {
			// Dev-only: render the project's docs/ folder as HTML at /__space_docs.
			server.middlewares.use("/__space_docs", async (req, res) => {
				const docsRoot = resolve(root, "docs");
				const url = (req.url ?? "/").split("?")[0] ?? "/";
				const rel = url.replace(/^\/+/, "");
				const target = resolve(docsRoot, rel || ".");
				if (target !== docsRoot && !target.startsWith(docsRoot + sep)) {
					res.statusCode = 403;
					res.end("forbidden");
					return;
				}
				const { stat, readdir, readFile } = await import("node:fs/promises");
				let st: import("node:fs").Stats;
				try {
					st = await stat(target);
				} catch {
					res.statusCode = 404;
					res.end("not found");
					return;
				}
				const css =
					"body{font-family:system-ui,-apple-system,sans-serif;max-width:860px;margin:2rem auto;padding:0 1.25rem;line-height:1.65;color:#222}" +
					"a{color:#2563eb}pre{background:#f4f4f5;padding:1rem;overflow:auto;border-radius:6px}" +
					"code{background:#f4f4f5;padding:.1rem .3rem;border-radius:3px;font-size:.9em}" +
					"h1,h2,h3{margin-top:1.6rem}ul{padding-left:1.25rem}hr{border:none;border-top:1px solid #e5e7eb;margin:2rem 0}";
				if (st.isDirectory()) {
					const entries = (await readdir(target, { withFileTypes: true }))
						.filter((e) => !e.name.startsWith("."))
						.sort((a, b) => a.name.localeCompare(b.name));
					const links = entries
						.map((e) => {
							const href = "/__space_docs/" + (rel ? rel + "/" : "") + e.name;
							return `<li><a href="${href}">${escapeHtml(e.name)}${e.isDirectory() ? "/" : ""}</a></li>`;
						})
						.join("");
					res.setHeader("Content-Type", "text/html; charset=utf-8");
					res.end(
						`<!doctype html><html><head><meta charset="utf-8"><title>docs</title><style>${css}</style></head><body><h1>/${escapeHtml(rel)}</h1><ul>${links}</ul></body></html>`,
					);
					return;
				}
				const raw = await readFile(target, "utf8");
				const body = target.endsWith(".md") ? renderMarkdown(raw) : `<pre>${escapeHtml(raw)}</pre>`;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(
					`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(rel)}</title><style>${css}</style></head><body>${body}<hr><p><a href="/__space_docs/">← docs</a></p></body></html>`,
				);
			});

			const syncFile = (file: string, dirs: string[]) => {
				if (!dirs.some((dir) => file.startsWith(dir + sep))) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};

			// Routes: sync on add/change/unlink.
			const routesDir = resolve(root, "app", "routes");
			server.watcher.add(routesDir);
			const onRouteChange = (file: string) => {
				if (!file.startsWith(routesDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onRouteChange);
			server.watcher.on("change", onRouteChange);
			server.watcher.on("unlink", onRouteChange);
			server.watcher.on("addDir", onRouteChange);
			server.watcher.on("unlinkDir", onRouteChange);

			// Pages: sync (route table changes).
			const pagesDir = resolve(root, "app", "pages");
			server.watcher.add(pagesDir);
			const onPageChange = (file: string) => {
				if (!file.startsWith(pagesDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onPageChange);
			server.watcher.on("change", onPageChange);
			server.watcher.on("unlink", onPageChange);
			server.watcher.on("addDir", onPageChange);
			server.watcher.on("unlinkDir", onPageChange);

			// DB: sql files regenerate typed queries; migrate.ts/queries changes too.
			const dbDir = resolve(root, "app", "db");
			const onDbChange = (file: string) => {
				if (!file.startsWith(dbDir + sep)) return;
				sync(root, mode).catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.add(dbDir);
			server.watcher.on("add", onDbChange);
			server.watcher.on("change", onDbChange);
			server.watcher.on("unlink", onDbChange);
			server.watcher.on("addDir", onDbChange);
			server.watcher.on("unlinkDir", onDbChange);

			// Bindings come from env.ts when Vite resolves its config, so a change needs a restart.
			const envFile = resolve(root, "app", "env.ts");
			const onEnvChange = (file: string) => {
				if (file !== envFile) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			server.watcher.on("add", onEnvChange);
			server.watcher.on("change", onEnvChange);
			server.watcher.on("unlink", onEnvChange);

			// Queue/cron/DO/workflow files change the Worker config: restart.
			const configDirs = [
				resolve(root, "app", "queues"),
				resolve(root, "app", "crons"),
			  resolve(root, "app", "durable-objects"),
			  resolve(root, "app", "workflows"),
			  resolve(root, "app", "middleware"),
			];
			const onConfigFileChange = (file: string) => {
				if (!configDirs.some((dir) => file.startsWith(dir + sep))) return;
				server.restart().catch((error: unknown) => server.config.logger.error(String(error)));
			};
			for (const dir of configDirs) server.watcher.add(dir);
			server.watcher.on("add", onConfigFileChange);
			server.watcher.on("change", onConfigFileChange);
			server.watcher.on("unlink", onConfigFileChange);
			server.watcher.on("addDir", onConfigFileChange);
			server.watcher.on("unlinkDir", onConfigFileChange);
		},
	};
}

export interface SpaceOptions {
	/** Passed through to the Cloudflare Vite plugin. */
	cloudflare?: Omit<PluginConfig, "config">;
}

/** The one Vite plugin a spacefn app needs: folder sync plus the Cloudflare runtime. */
export function space(options: SpaceOptions = {}): PluginOption[] {
	const state: SpaceState = {};
	return [
		spaceSync(state),
		cloudflare({
			...options.cloudflare,
			// `env.ts` cannot be imported by `cloudflare.config.ts`: the plugin makes
			// every file the config imports unreadable to the Worker.
			config: (worker) => {
				const queues = queueConfig(state.queueFiles ?? []);
				const crons = cronConfig(state.cronSchedules ?? []);
				const scheduled = [...queues.triggers, ...crons.triggers];
				const dos = durableObjectsConfig(state.durableObjectFiles ?? [], worker.name);
				const wfs = workflowsConfig(state.workflowFiles ?? [], worker.name);
				return {
					env: {
						...(state.envSchema && envBindings(state.envSchema)),
						...queues.env,
						...dos.env,
						...wfs.env,
						...worker.env,
					} as never,
					exports: { ...worker.exports, ...dos.exports, ...wfs.exports } as never,
					...(scheduled.length > 0 ? { triggers: scheduled as never } : {}),
				};
			},
		}),
	];
}
