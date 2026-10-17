import { glob as fsGlob } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";

import { type Plugin } from "vite";

import type { Generator } from "./types.js";

function globAsync(
	pattern: string,
	options: { cwd: string; absolute?: boolean },
): Promise<string[]> {
	return new Promise((resolve, reject) => {
		fsGlob(pattern, options, (err, matches) => {
			if (err) return reject(err);
			resolve(matches ?? []);
		});
	});
}

export function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/\./g, "\\.")
		.replace(/\*\*\//g, "{{GLOBSTAR_SLASH}}")
		.replace(/\*\*/g, "{{GLOBSTAR}}")
		.replace(/\*/g, "[^/]*")
		.replace(/\{\{GLOBSTAR_SLASH\}\}/g, "(.*/)?")
		.replace(/\{\{GLOBSTAR\}\}/g, ".*");
	return new RegExp(`^${escaped}$`);
}

async function runGenerator(
	root: string,
	generator: Generator,
): Promise<{ output: string; content: string; changed: boolean }> {
	const patterns = Array.isArray(generator.watch) ? generator.watch : [generator.watch];

	const files: string[] = [];
	for (const pattern of patterns) {
		const matched = await globAsync(pattern, { cwd: root, absolute: true });
		files.push(...matched);
	}

	const content = await generator.generate(files);
	const outputPath = resolve(root, generator.output);

	let changed = true;
	try {
		const existing = await readFile(outputPath, "utf-8");
		if (existing === content) changed = false;
	} catch {}

	if (changed && content) {
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, content, "utf-8");
	}

	return { output: generator.output, content, changed };
}

function debounce(fn: () => Promise<void>, ms: number): () => void {
	let timer: ReturnType<typeof setTimeout>;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(), ms);
	};
}

export function generators(...defs: Generator[]): Plugin {
	const root = process.cwd();

	return {
		name: "generators",

		async buildStart() {
			for (const generator of defs) {
				try {
					await runGenerator(root, generator);
				} catch (err) {
					console.error(`[generators] Error in generator "${generator.output}":`, err);
				}
			}
		},

		configureServer(server) {
			const outputGlobs = new Set(defs.map((d) => resolve(root, d.output)));

			const regenerate = debounce(async () => {
				let anyChanged = false;
				for (const generator of defs) {
					try {
						const { output, changed } = await runGenerator(root, generator);
						if (changed) {
							anyChanged = true;
							for (const env of Object.values(server.environments)) {
								const mod = env.moduleGraph.getModuleById("/" + output);
								if (mod) env.moduleGraph.invalidateModule(mod);
							}
						}
					} catch (err) {
						console.error(`[generators] Error in generator "${generator.output}":`, err);
					}
				}
				if (anyChanged) {
					server.hot.send({ type: "full-reload" });
				}
			}, 100);

			const handle = (file: string) => {
				if (outputGlobs.has(resolve(root, file))) return;
				const rel = relative(root, file);
				const matched = defs.some((d) => {
					const globs = Array.isArray(d.watch) ? d.watch : [d.watch];
					return globs.some((g) => globToRegex(g).test(rel));
				});
				if (matched) regenerate();
			};

			server.watcher.on("change", handle).on("add", handle).on("unlink", handle);
		},

		async generateBundle() {
			for (const generator of defs) {
				try {
					const { content } = await runGenerator(root, generator);
					this.emitFile({
						type: "asset",
						fileName: generator.output,
						source: content,
					});
				} catch (err) {
					console.error(`[generators] Error in generator "${generator.output}":`, err);
				}
			}
		},
	};
}
