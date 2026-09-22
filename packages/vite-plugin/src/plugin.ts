// --- Space Vite Plugin --------------------------------------------------------
// File-based code generation with SSR module invalidation
// https://vite.dev/guide/api-plugin.html

import { resolve, relative } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { runAll } from "./generator.js";
import type { SpaceOptions, ResolvedOptions, Generator } from "./types.js";

// --- Debounce helper ----------------------------------------------------------

function debounce(fn: () => Promise<void>, ms: number): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			fn();
		}, ms);
	};
}

// --- Find matching generators -------------------------------------------------

function findGenerators(generators: Generator[], filePath: string): Generator[] {
	return generators.filter((gen) => {
		const patterns = Array.isArray(gen.watch) ? gen.watch : [gen.watch];
		return patterns.some((pattern) => {
			// Simple check: does the file path match the glob pattern?
			// For exact matching, we rely on resolveGlobs in the runner
			const regex = globToRegex(pattern);
			return regex.test(relative(process.cwd(), filePath));
		});
	});
}

/** Convert a simple glob pattern to a regex */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/\./g, "\\.")
		.replace(/\*\*/g, "{{GLOBSTAR}}")
		.replace(/\*/g, "[^/]*")
		.replace(/\{\{GLOBSTAR\}\}/g, ".*")
		.replace(/\?/g, "[^/]");
	return new RegExp(`^${escaped}$`);
}

// --- Plugin factory -----------------------------------------------------------

export function space(options: SpaceOptions = {}): Plugin {
	const resolved: ResolvedOptions = {
		root: options.root ?? process.cwd(),
		generators: options.generators ?? [],
	};

	let server: ViteDevServer | null = null;

	return {
		name: "@spacefn/vite-plugin",

		// --- Build: run all generators once ------------------------------------
		async buildStart() {
			if (resolved.generators.length === 0) return;

			console.log("[space] Running generators...");
			const results = await runAll(resolved);
			for (const r of results) {
				if (r.changed) {
					console.log(`[space] Generated ${r.output}`);
				}
			}
		},

		// --- Dev: watch files, regenerate, invalidate ---------------------------
		configureServer(_server) {
			server = _server;

			// Collect all watch patterns from generators
			const watchDirs: string[] = [];
			for (const gen of resolved.generators) {
				const patterns = Array.isArray(gen.watch) ? gen.watch : [gen.watch];
				for (const pattern of patterns) {
					// Extract directory from glob (e.g. "pages/**/*.ts" → "pages")
					const dir = pattern.split("/")[0];
					if (dir && !dir.startsWith("**")) {
						watchDirs.push(resolve(resolved.root, dir));
					}
				}
			}

			// Add directories to watcher
			for (const dir of watchDirs) {
				server.watcher.add(dir);
			}

			// Debounced regeneration on file change
			const regenerate = debounce(async () => {
				if (!server) return;

				console.log("[space] File changed, regenerating...");
				const results = await runAll(resolved);
				const changed = results.filter((r) => r.changed);

				if (changed.length === 0) return;

				for (const r of changed) {
					console.log(`[space] Regenerated ${r.output}`);

					// Invalidate the module in Vite's SSR graph
					const mod = server.moduleGraph.getModuleById(`/@fs/${resolve(resolved.root, r.output)}`);
					if (mod) {
						server.moduleGraph.invalidateModule(mod);
					}
				}

				// Signal client to reload
				server.ws.send({ type: "full-reload" });
			}, 100);

			server.watcher.on("change", (file) => {
				// Skip non-source files
				if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return;
				// Skip generated output files
				if (file.includes(".space/")) return;

				const matching = findGenerators(resolved.generators, file);
				if (matching.length > 0) {
					regenerate();
				}
			});
		},
	};
}
