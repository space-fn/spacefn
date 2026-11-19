/** Unwraps the dev-mode proxy Cloudflare wraps around a binding when present. */
export function unwrapDurableObject<T>(binding: unknown): T {
	const candidate = binding as { binding?: unknown };
	if (candidate && typeof candidate.binding === "object" && candidate.binding !== null) {
		// Only unwrap when the inner object looks like the real binding (has methods).
		const inner = candidate.binding as Record<string, unknown>;
		if (Object.keys(inner).length > 0) return inner as T;
	}
	return binding as T;
}
