const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Hostnames a tenant may not take, because the platform or its tooling uses them. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
	"www",
	"api",
	"admin",
	"app",
	"apps",
	"auth",
	"static",
	"assets",
	"cdn",
	"mail",
	"support",
	"status",
	"docs",
]);

/** Lowercases a candidate slug and reports whether it is a valid, unreserved DNS label. */
export function isValidSlug(value: string): boolean {
	const slug = value.toLowerCase();
	return SLUG.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Throws with a reason when `value` cannot be a tenant slug. */
export function assertValidSlug(value: string): string {
	const slug = value.toLowerCase();
	if (!SLUG.test(slug)) {
		throw new Error(
			`"${value}" is not a valid slug: use 1-63 letters, digits or dashes, not starting or ending with a dash`,
		);
	}
	if (RESERVED_SLUGS.has(slug)) throw new Error(`"${value}" is reserved`);
	return slug;
}
