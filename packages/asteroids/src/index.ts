// --- @spacefn/asteroids ------------------------------------------------------
// Umbrella package — re-exports everything

export * from "@spacefn/html";
export * from "@spacefn/css";
export * from "@spacefn/db";

// Re-export datastar selectively to avoid `del` collision with html
export {
	ds,
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
	clipboard,
	toast,
	setAll,
	toggleAll,
	resetAll,
	actions,
} from "@spacefn/datastar";

export type { DomEvent, DataOnModifier, PostOptions, GetOptions } from "@spacefn/datastar";
