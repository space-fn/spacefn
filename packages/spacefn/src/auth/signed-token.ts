import { fromBase64Url, toBase64Url } from "./encoding";

const MIN_KEY_LENGTH = 32;

export interface TokenPayload {
	/** What the token may be used for, e.g. `invite` or `password-reset`. */
	purpose: string;
	/** Who or what the token is about, e.g. a user or tenant id. */
	subject: string;
	/** Unique id. Record it when the token is used, to make the token single-use. */
	jti: string;
	/** Epoch milliseconds after which the token is refused. */
	expiresAt: number;
}

export class TokenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TokenError";
	}
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
	if (secret.length < MIN_KEY_LENGTH)
		throw new TokenError(`Token key must be at least ${MIN_KEY_LENGTH} characters`);
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		[usage],
	);
}

/** Issues a signed token that expires after `ttlMs`. */
export async function signToken(
	claims: { purpose: string; subject: string },
	secret: string,
	ttlMs: number,
	now: number,
): Promise<string> {
	const payload: TokenPayload = {
		...claims,
		jti: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
		expiresAt: now + ttlMs,
	};
	const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const key = await hmacKey(secret, "sign");
	const signature = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
	);
	return `${body}.${toBase64Url(signature)}`;
}

/**
 * Checks a token's signature, purpose and expiry, and returns its claims. Every
 * failure is a `TokenError` with a reason, but the signature is checked first, so
 * a forged token learns nothing about the claims.
 */
export async function verifyToken(
	token: string,
	secret: string,
	purpose: string,
	now: number,
): Promise<TokenPayload> {
	const [body, signature, extra] = token.split(".");
	if (!body || !signature || extra !== undefined) throw new TokenError("Token is malformed");

	const key = await hmacKey(secret, "verify");
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		new Uint8Array(fromBase64Url(signature)),
		new TextEncoder().encode(body),
	);
	if (!valid) throw new TokenError("Token signature is invalid");

	let payload: TokenPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as TokenPayload;
	} catch {
		throw new TokenError("Token is malformed");
	}
	if (payload.purpose !== purpose) throw new TokenError("Token is for a different purpose");
	if (now >= payload.expiresAt) throw new TokenError("Token has expired");
	return payload;
}
