// --- Space Plugin Types -------------------------------------------------------

/** Code generator configuration */
export interface Generator {
	/** Glob pattern(s) to watch for source files */
	watch: string | string[];
	/** Output file path (relative to project root) */
	output: string;
	/**
	 * Generate content from matched files.
	 * @param files - Absolute paths of files matching the glob
	 * @returns File content to write
	 */
	generate(files: string[]): string | Promise<string>;
}

/** Plugin options */
export interface SpaceOptions {
	/** Working directory (default: process.cwd()) */
	root?: string;
	/** Code generators */
	generators?: Generator[];
}

/** Resolved options with defaults applied */
export interface ResolvedOptions {
	root: string;
	generators: Generator[];
}
