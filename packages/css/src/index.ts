// ─── @space/css ───────────────────────────────────────────────────────────────
// Functional server-rendered CSS library

// ─── Core API ─────────────────────────────────────────────────────────────────

export { css, getCSS, drainStyles } from "./css.js";
export { tokens } from "./tokens.js";

// ─── Transition Helpers ───────────────────────────────────────────────────────

export {
	transition,
	transitionAll,
	transitionColors,
	transitionTransform,
	transitionOpacity,
	easeLinear,
	easeIn,
	easeOut,
	easeInOut,
	easeStandard,
	easeDecelerate,
	easeAccelerate,
	animation,
	animationInfinite,
	duration,
} from "./transition.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
	CSSValue,
	CSSProperties,
	TokenMap,
	TokenRefs,
	VariantConfig,
	ResolvedVariants,
	VariantDefaults,
	CompiledStyle,
	CompiledVariantStyle,
	CSSInput,
} from "./types.js";
