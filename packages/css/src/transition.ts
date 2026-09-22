// ─── CSS Transition & Animation Helpers ───────────────────────────────────────
// Generate real CSS strings for transitions and animations

/** Transition shorthand: property duration timing delay */
export function transition(
	property: string | string[],
	duration = "200ms",
	timing = "ease",
	delay = "0s",
): string {
	const props = Array.isArray(property) ? property.join(", ") : property;
	return `${props} ${duration} ${timing} ${delay}`;
}

/** Transition all properties */
export function transitionAll(duration = "200ms", timing = "ease"): string {
	return `all ${duration} ${timing}`;
}

/** Transition colors (background + color + border) */
export function transitionColors(duration = "200ms", timing = "ease"): string {
	return `background-color ${duration} ${timing}, color ${duration} ${timing}, border-color ${duration} ${timing}`;
}

/** Transition transform */
export function transitionTransform(duration = "200ms", timing = "ease"): string {
	return `transform ${duration} ${timing}`;
}

/** Transition opacity */
export function transitionOpacity(duration = "200ms", timing = "ease"): string {
	return `opacity ${duration} ${timing}`;
}

// ─── Timing Functions ─────────────────────────────────────────────────────────

export const easeLinear = "linear";
export const easeIn = "cubic-bezier(0.4, 0, 1, 1)";
export const easeOut = "cubic-bezier(0, 0, 0.2, 1)";
export const easeInOut = "cubic-bezier(0.4, 0, 0.2, 1)";
export const easeStandard = "cubic-bezier(0.4, 0, 0.2, 1)";
export const easeDecelerate = "cubic-bezier(0, 0, 0.2, 1)";
export const easeAccelerate = "cubic-bezier(0.4, 0, 1, 1)";

// ─── Animation Helpers ────────────────────────────────────────────────────────

/** Animation shorthand */
export function animation(
	name: string,
	duration = "300ms",
	timing = "ease",
	delay = "0s",
	iterationCount = "1",
	direction = "normal",
	fillMode = "none",
): string {
	return `${name} ${duration} ${timing} ${delay} ${iterationCount} ${direction} ${fillMode}`;
}

/** Infinite animation */
export function animationInfinite(name: string, duration = "300ms", timing = "ease"): string {
	return `${name} ${duration} ${timing} infinite`;
}

// ─── Duration Tokens ──────────────────────────────────────────────────────────

export const duration = {
	fast: "100ms",
	normal: "200ms",
	slow: "300ms",
	slower: "500ms",
} as const;
