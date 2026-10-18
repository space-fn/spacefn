/** Unwraps the dev-mode proxy Cloudflare wraps around a Durable Object binding. */
export function unwrapDurableObject<T>(binding: unknown): T {
	const candidate = binding as { binding?: unknown };
	return (candidate?.binding ?? binding) as T;
}
