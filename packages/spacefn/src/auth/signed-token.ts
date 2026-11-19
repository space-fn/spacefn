import { Clock, Duration, Effect, Redacted, Schema } from "effect";

import { fromBase64Url, randomBytes, toBase64Url } from "./encoding.ts";

const MIN_KEY_LENGTH = 32;

export interface TokenClaims {
	/** What the token is for, e.g. `verify-email` or `password-reset`. */
	readonly purpose: string;
	/** Who or what it is about, e.g. a user id. */
	readonly subject: string;
	/** Unique id. Record it when the token is used to make the token single-use. */
	readonly jti: string;
	/** Epoch ms after which the token is refused. */
	readonly expiresAt: number;
}

export class InvalidToken extends Schema.TaggedError<InvalidToken>()("InvalidToken", {
	reason: Schema.Literals(["malformed", "signature", "purpose", "expired"]),
	message: Schema.String,
}) {}

type Secret = string | Redacted.Redacted<string>;

const hmacKey = (secret: Secret, usage: "sign" | "verify") => {
	const raw = Redacted.isRedacted(secret) ? Redacted.value(secret) : secret;
	if (raw.length < MIN_KEY_LENGTH)
		throw new RangeError(`Token keys need at least ${MIN_KEY_LENGTH} characters`);
	return Effect.promise(() =>
		crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(raw),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			[usage],
		),
	);
};

const invalid = (reason: InvalidToken["reason"], message: string) =>
	Effect.fail(new InvalidToken({ reason, message }));

/** Issues an HMAC-signed token for `purpose` about `subject`, valid for `ttl`. */
const sign = (
	claims: { readonly purpose: string; readonly subject: string },
	secret: Secret,
	ttl: Duration.Input,
): Effect.Effect<string> =>
	Effect.gen(function* () {
		const payload: TokenClaims = {
			...claims,
			jti: toBase64Url(randomBytes(16)),
			expiresAt:
				(yield* Clock.currentTimeMillis) + Duration.toMillis(Duration.fromInputUnsafe(ttl)),
		};
		const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
		const key = yield* hmacKey(secret, "sign");
		const signature = yield* Effect.promise(() =>
			crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
		);
		return `${body}.${toBase64Url(new Uint8Array(signature))}`;
	});

const Claims = Schema.Struct({
	purpose: Schema.String,
	subject: Schema.String,
	jti: Schema.String,
	expiresAt: Schema.Number,
});

/**
 * Checks a token's signature, then its purpose and expiry, and returns its
 * claims. The signature comes first, so a forged token learns nothing more.
 */
const verify = (
	token: string,
	secret: Secret,
	purpose: string,
): Effect.Effect<TokenClaims, InvalidToken> =>
	Effect.gen(function* () {
		const [body, signature, extra] = token.split(".");
		if (!body || !signature || extra !== undefined)
			return yield* invalid("malformed", "Token is malformed");
		const signatureBytes = fromBase64Url(signature);
		const key = yield* hmacKey(secret, "verify");
		const valid =
			signatureBytes !== undefined &&
			(yield* Effect.promise(() =>
				crypto.subtle.verify(
					"HMAC",
					key,
					new Uint8Array(signatureBytes),
					new TextEncoder().encode(body),
				),
			));
		if (!valid) return yield* invalid("signature", "Token signature is invalid");
		const claims = yield* Effect.try({
			try: () => JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as unknown,
			catch: () => new InvalidToken({ reason: "malformed", message: "Token is malformed" }),
		}).pipe(
			Effect.flatMap(Schema.decodeUnknownEffect(Claims)),
			Effect.mapError(
				() => new InvalidToken({ reason: "malformed", message: "Token is malformed" }),
			),
		);
		if (claims.purpose !== purpose)
			return yield* invalid("purpose", "Token is for a different purpose");
		if ((yield* Clock.currentTimeMillis) >= claims.expiresAt)
			return yield* invalid("expired", "Token has expired");
		return claims;
	});

/** Signed, expiring tokens for links: email verification, password reset, invites. */
export const SignedToken = { sign, verify } as const;
