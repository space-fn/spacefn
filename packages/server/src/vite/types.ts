// --- Vite Plugin Types --------------------------------------------------------

/** Scanned route file */
export interface ScannedRoute {
	/** Relative path from src/routes/ */
	path: string;
	/** Absolute file path */
	file: string;
	/** URL pattern (e.g., "/books/:slug") */
	pattern: string;
	/** HTTP method ( "*" = all ) */
	method: string;
}

/** Scanned middleware file */
export interface ScannedMiddleware {
	/** Relative path from src/middlewares/ */
	path: string;
	/** Absolute file path */
	file: string;
	/** Sort order (from filename prefix) */
	order: number;
	/** Middleware name */
	name: string;
}

/** Vite plugin options */
export interface SpacePluginOptions {
	/** Working directory (default: process.cwd()) */
	root?: string;
}
