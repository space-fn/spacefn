// --- DataStar Client Attributes -----------------------------------------------
// Typed DataStar attribute generation for h() elements
// https://data-star.dev/
import type { AttrValue } from "@spacefn/html";

import type { DataOnModifier, GetOptions, PostOptions } from "./types.js";

// --- Action path helper -------------------------------------------------------

export const actions = {
	/** Generate ?_action=name URL for the current page */
	path(actionName: string): string {
		return `?_action=${actionName}`;
	},
};

// --- HTTP expression builders -------------------------------------------------

function buildFetchExpression(
	method: string,
	url: string,
	opts: PostOptions | GetOptions = {},
): string {
	const parts: string[] = [method, `('${url}')`];

	if ("contentType" in opts && opts.contentType) {
		parts.push(`{contentType:'${opts.contentType}'}`);
	}
	if (opts.merge) {
		parts.push(`{merge:'${opts.merge}'}`);
	}
	if ("signals" in opts && opts.signals) {
		parts.push(`{signals:'${opts.signals.join(",")}'}`);
	}
	if (opts.indicator) {
		parts.push(`{indicator:'${opts.indicator}'}`);
	}

	return parts.join("");
}

function get(url: string, opts: GetOptions = {}): string {
	return buildFetchExpression("get", url, opts);
}

function post(url: string, opts: PostOptions = {}): string {
	return buildFetchExpression("post", url, opts);
}

function put(url: string, opts: PostOptions = {}): string {
	return buildFetchExpression("put", url, opts);
}

function patch(url: string, opts: PostOptions = {}): string {
	return buildFetchExpression("patch", url, opts);
}

function del(url: string, opts: GetOptions = {}): string {
	return buildFetchExpression("delete", url, opts);
}

// --- Action expression builders -----------------------------------------------

function clipboard(text: string): string {
	return `@clipboard('${text.replace(/'/g, "\\'")}')`;
}

function toast(message: string, opts?: { level?: string; timeout?: number }): string {
	if (!opts) return `@toast('${message.replace(/'/g, "\\'")}')`;
	const parts = [`'${message.replace(/'/g, "\\'")}'`];
	if (opts.level) parts.push(`{level:'${opts.level}'}`);
	if (opts.timeout) parts.push(`{timeout:${opts.timeout}}`);
	return `@toast(${parts.join(", ")})`;
}

function setAll(pattern: string, value: unknown): string {
	return `@setAll(${pattern}, ${JSON.stringify(value)})`;
}

function toggleAll(pattern?: string): string {
	if (pattern) return `@toggleAll({include: ${pattern}})`;
	return "@toggleAll()";
}

function resetAll(pattern?: string): string {
	if (pattern) return `@resetAll({only: ${pattern}})`;
	return "@resetAll()";
}

function interval(expression: string, ms: number): string {
	return `@setInterval(() => ${expression}, ${ms})`;
}

function timeout(expression: string, ms: number): string {
	return `@setTimeout(() => ${expression}, ${ms})`;
}

// --- DataStar attribute generators --------------------------------------------

function dataSignals(signals: Record<string, unknown>): Record<string, AttrValue> {
	return { "data-signals": JSON.stringify(signals) };
}

function dataSignal(name: string, expression: string): Record<string, AttrValue> {
	return { [`data-signals-${name}`]: expression };
}

function dataText(expression: string): Record<string, AttrValue> {
	return { "data-text": expression };
}

function dataBind(attribute: string, expression: string): Record<string, AttrValue> {
	return { [`data-bind-${attribute}`]: expression };
}

function dataComputed(name: string, expression: string): Record<string, AttrValue> {
	return { [`data-computed-${name}`]: expression };
}

function dataComputedAll(expressions: Record<string, string>): Record<string, AttrValue> {
	return { "data-computed": JSON.stringify(expressions) };
}

function dataShow(expression: string): Record<string, AttrValue> {
	return { "data-show": expression };
}

function dataClass(className: string, expression: string): Record<string, AttrValue> {
	return { [`data-class-${className}`]: expression };
}

function dataAttr(attribute: string, expression: string): Record<string, AttrValue> {
	return { [`data-attr-${attribute}`]: expression };
}

function dataAttrs(attrs: Record<string, string>): Record<string, AttrValue> {
	const pairs = Object.entries(attrs)
		.map(([k, v]) => `'${k}': ${v}`)
		.join(", ");
	return { "data-attr": `{${pairs}}` };
}

function dataRef(name: string): Record<string, AttrValue> {
	return { "data-ref": name };
}

function dataOn(
	event: string,
	expression: string,
	modifier?: DataOnModifier,
): Record<string, AttrValue> {
	const key = modifier ? `data-on-${event}.__${modifier}` : `data-on-${event}`;
	return { [key]: expression };
}

function dataIndicator(signalOrSelector: string): Record<string, AttrValue> {
	return { "data-indicator": signalOrSelector };
}

function dataEffect(expression: string): Record<string, AttrValue> {
	return { "data-effect": expression };
}

function dataInit(expression: string): Record<string, AttrValue> {
	return { "data-init": expression };
}

function dataIgnore(): Record<string, AttrValue> {
	return { "data-ignore": "" };
}

function dataIgnoreSelf(): Record<string, AttrValue> {
	return { "data-ignore.__self": "" };
}

function dataIgnoreMorph(): Record<string, AttrValue> {
	return { "data-ignore-morph": "" };
}

// --- Namespace ----------------------------------------------------------------

export const ds = {
	// Reactive data
	dataSignals,
	dataSignal,
	dataText,
	dataBind,
	dataComputed,
	dataComputedAll,

	// DOM manipulation
	dataShow,
	dataClass,
	dataAttr,
	dataAttrs,
	dataRef,

	// Event handling
	dataOn,
	dataIndicator,
	dataEffect,
	dataInit,

	// Control flow
	dataIgnore,
	dataIgnoreSelf,
	dataIgnoreMorph,

	// HTTP
	get,
	post,
	put,
	patch,
	delete: del,

	// Actions
	clipboard,
	toast,
	setAll,
	toggleAll,
	resetAll,
	interval,
	timeout,
};

// --- Named exports (for tree-shaking or direct use) ---------------------------

export {
	dataSignals,
	dataSignal,
	dataText,
	dataBind,
	dataComputed,
	dataComputedAll,
	dataShow,
	dataClass,
	dataAttr,
	dataAttrs,
	dataRef,
	dataOn,
	dataIndicator,
	dataEffect,
	dataInit,
	dataIgnore,
	dataIgnoreSelf,
	dataIgnoreMorph,
	get,
	post,
	put,
	patch,
	del,
	clipboard,
	toast,
	setAll,
	toggleAll,
	resetAll,
	interval,
	timeout,
};

export type { DataOnModifier, PostOptions, GetOptions } from "./types.js";
