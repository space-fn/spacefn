import { constantTimeEqual } from "./encoding";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
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
}

export function base32Decode(text: string): Uint8Array {
	const clean = text.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of clean) {
		const index = BASE32.indexOf(char);
		if (index === -1) throw new Error("Secret is not valid base32");
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Uint8Array.from(out);
}

/** A new 160-bit secret, base32 encoded, as authenticator apps expect. Store it encrypted. */
export function newTotpSecret(): string {
	return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function codeAt(secret: Uint8Array, step: number): Promise<string> {
	const counter = new Uint8Array(8);
	new DataView(counter.buffer).setBigUint64(0, BigInt(step));
	const key = await crypto.subtle.importKey(
		"raw",
		new Uint8Array(secret),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
	const offset = (mac[mac.length - 1] as number) & 0x0f;
	const binary =
		(((mac[offset] as number) & 0x7f) << 24) |
		(((mac[offset + 1] as number) & 0xff) << 16) |
		(((mac[offset + 2] as number) & 0xff) << 8) |
		((mac[offset + 3] as number) & 0xff);
	return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The six-digit code for the 30-second step containing `atMs`. */
export function totpAt(secret: string, atMs: number): Promise<string> {
	return codeAt(base32Decode(secret), Math.floor(atMs / 1000 / STEP_SECONDS));
}

export interface TotpVerdict {
	valid: boolean;
	/** The step the code matched. Store it and refuse any step at or below it, so a code works once. */
	step?: number;
}

/**
 * Checks a code against the current step and `window` steps either side, to allow
 * for clock drift. Pass the last step you accepted as `afterStep` to refuse replays.
 */
export async function verifyTotp(
	code: string,
	secret: string,
	atMs: number,
	options: { window?: number; afterStep?: number } = {},
): Promise<TotpVerdict> {
	const window = options.window ?? 1;
	const current = Math.floor(atMs / 1000 / STEP_SECONDS);
	const key = base32Decode(secret);
	const given = new TextEncoder().encode(code);
	let match: number | undefined;
	for (let step = current - window; step <= current + window; step++) {
		if (options.afterStep !== undefined && step <= options.afterStep) continue;
		const expected = new TextEncoder().encode(await codeAt(key, step));
		if (constantTimeEqual(expected, given)) match = step;
	}
	return match === undefined ? { valid: false } : { valid: true, step: match };
}

/** The `otpauth://` URI an authenticator app reads from a QR code. */
export function otpauthUri(options: { secret: string; issuer: string; account: string }): string {
	const label = encodeURIComponent(`${options.issuer}:${options.account}`);
	const params = new URLSearchParams({
		secret: options.secret,
		issuer: options.issuer,
		algorithm: "SHA1",
		digits: String(DIGITS),
		period: String(STEP_SECONDS),
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}
