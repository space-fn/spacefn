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

/** Scanned page: matched *.page.ts + *.server.ts pair */
export interface ScannedPage {
	/** Relative path from src/pages/ (without extension) */
	path: string;
	/** URL pattern (e.g., "/books/:slug") */
	pattern: string;
	/** Absolute path to *.page.ts file (null if no page file) */
	pageFile: string | null;
	/** Absolute path to *.server.ts file (null if no server file) */
	serverFile: string | null;
	/** Has a loader export */
	hasLoader: boolean;
	/** Has an actions export */
	hasActions: boolean;
}

/** Vite plugin options */
export interface SpacePluginOptions {
	/** Working directory (default: process.cwd()) */
	root?: string;
}
