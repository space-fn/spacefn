// --- DataStar Types -----------------------------------------------------------
// Shared types for client-side attributes and server-side SSE

// --- Client Types ------------------------------------------------------------

/** Modifier for data-on event handlers */
export type DataOnModifier =
	| "immelmann"
	| "counter"
	| "debounce"
	| "throttle"
	| "leading"
	| "fit"
	| "once"
	| "none"
	| "ignore";

/** Options for POST/PUT/PATCH fetch expressions */
export interface PostOptions {
	contentType?: "form" | "json";
	merge?: "replace" | "append" | "prepend";
	signals?: string[];
	indicator?: string;
}

/** Options for GET/DELETE fetch expressions */
export interface GetOptions {
	merge?: "replace" | "append" | "prepend";
	indicator?: string;
}

/** Options for patchElements SSE event */
export interface PatchElementsOptions {
	merge?: "morph" | "replace" | "inner" | "outer";
	select?: string;
	settleDuration?: number;
	useViewTransition?: boolean;
}

/** Options for patchSignals SSE event */
export interface PatchSignalsOptions {
	onlyIfMissing?: boolean;
}

/** Server-side SSE response builder */
export interface DatastarSSE {
	patchElements(html: string, options?: PatchElementsOptions): void;
	patchSignals(signals: Record<string, unknown>, options?: PatchSignalsOptions): void;
	removeElements(selectors: string): void;
	removeSignals(signalNames: string[]): void;
	executeScript(script: string, options?: { autoRemove?: boolean }): void;
	toResponse(): Response;
}
