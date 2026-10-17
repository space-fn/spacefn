// --- DataStar Types -----------------------------------------------------------
// Shared types for client-side attributes and server-side SSE

// --- Client Types ------------------------------------------------------------

/** Common DOM events for dataOn */
export type DomEvent =
	| "click"
	| "dblclick"
	| "mousedown"
	| "mouseup"
	| "mousemove"
	| "mouseenter"
	| "mouseleave"
	| "mouseover"
	| "mouseout"
	| "contextmenu"
	| "wheel"
	| "keydown"
	| "keyup"
	| "keypress"
	| "input"
	| "change"
	| "submit"
	| "reset"
	| "focus"
	| "blur"
	| "focusin"
	| "focusout"
	| "scroll"
	| "resize"
	| "load"
	| "DOMContentLoaded"
	| "error"
	| "touchstart"
	| "touchend"
	| "touchmove"
	| "touchcancel"
	| "pointerdown"
	| "pointerup"
	| "pointermove"
	| "pointerover"
	| "pointerout"
	| "pointerenter"
	| "pointerleave"
	| "drag"
	| "dragstart"
	| "dragend"
	| "dragover"
	| "dragenter"
	| "dragleave"
	| "drop"
	| "copy"
	| "cut"
	| "paste"
	| "animationstart"
	| "animationend"
	| "animationiteration"
	| "transitionend"
	| "transitionstart"
	| "transitionrun"
	| "transitioncancel"
	| (string & {});

/** Modifier for data-on event handlers (matches datastar docs) */
export type DataOnModifier =
	| "once"
	| "passive"
	| "capture"
	| "window"
	| "document"
	| "outside"
	| "prevent"
	| "stop"
	| "viewtransition"
	| "leading"
	| "notrailing"
	| "noleading"
	| "trailing"
	| (string & {});

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
	merge?:
		| "morph"
		| "replace"
		| "inner"
		| "outer"
		| "prepend"
		| "append"
		| "before"
		| "after"
		| "remove";
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
