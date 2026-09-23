// --- Generator ----------------------------------------------------------------
// Glob matching, file scanning, and code generation

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";

import fg from "fast-glob";

import type { Generator, ResolvedOptions } from "./types.js";

// --- Glob matching ------------------------------------------------------------

/** Resolve glob patterns to absolute file paths */
export async function resolveGlobs(root: string, patterns: string | string[]): Promise<string[]> {
	const globs = Array.isArray(patterns) ? patterns : [patterns];
	return fg(globs, {
		cwd: root,
		absolute: true,
		onlyFiles: true,
		ignore: ["**/node_modules/**", "**/.space/**"],
	});
}

// --- Output comparison --------------------------------------------------------

/** Check if output file needs updating */
async function needsUpdate(outputPath: string, newContent: string): Promise<boolean> {
	try {
		const existing = await readFile(outputPath, "utf-8");
		return existing !== newContent;
	} catch {
		// File doesn't exist
		return true;
	}
}

// --- Single generator run -----------------------------------------------------

export interface GenerateResult {
	/** Output path (relative to root) */
	output: string;
	/** Whether the file was written */
	changed: boolean;
}

/** Run a single generator: match globs → generate → write if changed */
export async function runGenerator(root: string, generator: Generator): Promise<GenerateResult> {
	const files = await resolveGlobs(root, generator.watch);
	const content = await generator.generate(files);
	const outputPath = `${root}/${generator.output}`;

	const changed = await needsUpdate(outputPath, content);
	if (changed) {
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, content, "utf-8");
	}

	return {
		output: relative(root, outputPath),
		changed,
	};
}

// --- Run all generators -------------------------------------------------------

export async function runAll(options: ResolvedOptions): Promise<GenerateResult[]> {
	const results: GenerateResult[] = [];
	for (const gen of options.generators) {
		results.push(await runGenerator(options.root, gen));
	}
	return results;
}
