import { fromBase64Url, toBase64Url } from "./encoding";

const TOKEN_BYTES = 32;

export interface NewSession {
	/** Give this to the browser, in a cookie. It is shown once. */
	token: string;
	/** Store this in the database. The token itself is never stored. */
	tokenHash: string;
}

/** Hashes a session token. Tokens have 256 bits of entropy, so a fast hash is enough. */
export async function hashSessionToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(fromBase64Url(token)));
	return toBase64Url(new Uint8Array(digest));
}

/** A new random session token and its hash. */
export async function newSession(): Promise<NewSession> {
	const token = toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
	return { token, tokenHash: await hashSessionToken(token) };
}

export interface SessionRecord {
	expiresAt: number;
	lastSeenAt: number;
}

export interface SessionPolicy {
	/** Longest a session lasts from sign-in, in milliseconds. */
	absoluteMs: number;
	/** Longest a session may sit unused, in milliseconds. */
	idleMs: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
	absoluteMs: 30 * 24 * 60 * 60 * 1000,
	idleMs: 7 * 24 * 60 * 60 * 1000,
};

/** False once the session passed its absolute expiry or sat idle too long. */
export function isSessionActive(
	session: SessionRecord,
	now: number,
	policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): boolean {
	return now < session.expiresAt && now - session.lastSeenAt < policy.idleMs;
}

export interface CookieOptions {
	name?: string;
	maxAgeSeconds?: number;
	/** Set false only for local development over plain http. */
	secure?: boolean;
}

/** The `Set-Cookie` value that sets a session. HttpOnly, Secure and SameSite=Lax by default. */
export function sessionCookie(token: string, options: CookieOptions = {}): string {
	const name = options.name ?? "session";
	const parts = [
		`${name}=${token}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${options.maxAgeSeconds ?? DEFAULT_SESSION_POLICY.absoluteMs / 1000}`,
	];
	if (options.secure !== false) parts.push("Secure");
	return parts.join("; ");
}

/** The `Set-Cookie` value that clears the session cookie. */
export function clearSessionCookie(name = "session"): string {
	return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

/** Reads one cookie from a `Cookie` header. Returns `undefined` when it is absent. */
export function readCookie(
	header: string | null | undefined,
	name = "session",
): string | undefined {
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [key, ...value] = part.trim().split("=");
		if (key === name) return value.join("=");
	}
	return undefined;
}
