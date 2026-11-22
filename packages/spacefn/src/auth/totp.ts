import { Clock, Effect, Redacted } from "effect";

import { constantTimeEqual, randomBytes } from "./encoding.ts";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export const base32Encode = (bytes: Uint8Array): string => {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	return out;
};

/** Decodes base32 (case and spaces ignored), or `undefined` when it isn't base32. */
export const base32Decode = (text: string): Uint8Array | undefined => {
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of text.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "")) {
		const index = BASE32.indexOf(char);
		if (index === -1) return undefined;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Uint8Array.from(out);
};

type Secret = string | Redacted.Redacted<string>;
const reveal = (secret: Secret) => (Redacted.isRedacted(secret) ? Redacted.value(secret) : secret);

const keyOf = (secret: Secret) => {
	const bytes = base32Decode(reveal(secret));
	if (!bytes) throw new TypeError("TOTP secret is not base32");
	return bytes;
};

const codeAt = (key: Uint8Array, step: number) =>
	Effect.promise(async () => {
		const counter = new Uint8Array(8);
		new DataView(counter.buffer).setBigUint64(0, BigInt(step));
		const hmac = await crypto.subtle.importKey(
			"raw",
			new Uint8Array(key),
			{ name: "HMAC", hash: "SHA-1" },
			false,
			["sign"],
		);
		const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, counter));
		const offset = (mac[mac.length - 1] as number) & 0x0f;
		const binary =
			(((mac[offset] as number) & 0x7f) << 24) |
			(((mac[offset + 1] as number) & 0xff) << 16) |
			(((mac[offset + 2] as number) & 0xff) << 8) |
			((mac[offset + 3] as number) & 0xff);
		return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
	});

const stepAt = (millis: number) => Math.floor(millis / 1000 / STEP_SECONDS);

/** A new 160-bit secret, base32, as authenticator apps expect. Store it encrypted or as a secret. */
const newSecret = (): string => base32Encode(randomBytes(20));

/** The six-digit code for the current 30-second step. */
const code = (secret: Secret): Effect.Effect<string> =>
	Effect.flatMap(Clock.currentTimeMillis, (now) => codeAt(keyOf(secret), stepAt(now)));

export interface TotpCheck {
	readonly valid: boolean;
	/** The step the code matched. Store it and pass it as `afterStep` next time, so a code works once. */
	readonly step?: number;
}

/**
 * Checks a code against the current step and `window` steps either side (for
 * clock drift). Steps at or before `afterStep` are refused, so codes can't be replayed.
 */
const verify = (
	given: string,
	secret: Secret,
	options: { readonly window?: number; readonly afterStep?: number } = {},
): Effect.Effect<TotpCheck> =>
	Effect.gen(function* () {
		const window = options.window ?? 1;
		const current = stepAt(yield* Clock.currentTimeMillis);
		const key = keyOf(secret);
		const bytes = new TextEncoder().encode(given);
		let match: number | undefined;
		for (let step = current - window; step <= current + window; step++) {
			if (options.afterStep !== undefined && step <= options.afterStep) continue;
			if (constantTimeEqual(new TextEncoder().encode(yield* codeAt(key, step)), bytes))
				match = step;
		}
		return match === undefined ? { valid: false } : { valid: true, step: match };
	});

/** The `otpauth://` URI an authenticator app reads from a QR code. */
const uri = (options: {
	readonly secret: Secret;
	readonly issuer: string;
	readonly account: string;
}): string => {
	const label = encodeURIComponent(`${options.issuer}:${options.account}`);
	const params = new URLSearchParams({
		secret: reveal(options.secret),
		issuer: options.issuer,
		algorithm: "SHA1",
		digits: String(DIGITS),
		period: String(STEP_SECONDS),
	});
	return `otpauth://totp/${label}?${params}`;
};

/** Time-based one-time codes (RFC 6238) for authenticator-app 2FA. */
export const Totp = { newSecret, code, verify, uri } as const;
