import { Effect, Schema } from "effect";

import { constantTimeEqual, fromBase64Url, randomBytes, toBase64Url } from "./encoding.ts";

/**
 * The most PBKDF2 iterations Workers accept; more fail at run time. It is
 * below OWASP's 600,000, so pair passwords with rate limiting on sign-in.
 */
export const MAX_ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 12;
/** Limits the work one request can ask for. */
export const MAX_PASSWORD_LENGTH = 1024;

const ALGORITHM = "pbkdf2-sha256";
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** A password the policy refuses. Show `message` to the user. */
export class WeakPassword extends Schema.TaggedError<WeakPassword>()("WeakPassword", {
	reason: Schema.Literals(["too-short", "too-long"]),
	message: Schema.String,
}) {}

export interface PasswordOptions {
	/** Iterations for new hashes, and the target `needsRehash` compares with. Default `MAX_ITERATIONS`. */
	readonly iterations?: number;
	/**
	 * A server secret mixed in before PBKDF2. Keep it outside the database (an
	 * env secret), so a stolen database alone can't be brute-forced. Hashing and
	 * verifying must use the same value.
	 */
	readonly pepper?: string;
}

export interface PasswordCheck {
	readonly valid: boolean;
	/** The hash used fewer iterations than the target: store a fresh hash after this sign-in. */
	readonly needsRehash: boolean;
}

const checkIterations = (iterations: number) => {
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS)
		throw new RangeError(`Iterations must be an integer from 1 to ${MAX_ITERATIONS}`);
};

const derive = (password: string, salt: Uint8Array, iterations: number, pepper?: string) =>
	Effect.promise(async () => {
		let input: BufferSource = new TextEncoder().encode(password);
		if (pepper !== undefined) {
			const key = await crypto.subtle.importKey(
				"raw",
				new TextEncoder().encode(pepper),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["sign"],
			);
			input = await crypto.subtle.sign("HMAC", key, input);
		}
		const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveBits"]);
		const bits = await crypto.subtle.deriveBits(
			{ name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash: "SHA-256" },
			key,
			KEY_BYTES * 8,
		);
		return new Uint8Array(bits);
	});

/**
 * Hashes a password as `pbkdf2-sha256$<iterations>$<salt>$<hash>`. The format
 * records its parameters, so the count can change later without breaking old
 * hashes. Fails with `WeakPassword` outside the length policy.
 */
const hash = (
	password: string,
	options: PasswordOptions = {},
): Effect.Effect<string, WeakPassword> =>
	Effect.gen(function* () {
		if (password.length < MIN_PASSWORD_LENGTH)
			return yield* new WeakPassword({
				reason: "too-short",
				message: `Use at least ${MIN_PASSWORD_LENGTH} characters`,
			});
		if (password.length > MAX_PASSWORD_LENGTH)
			return yield* new WeakPassword({
				reason: "too-long",
				message: `Use at most ${MAX_PASSWORD_LENGTH} characters`,
			});
		const iterations = options.iterations ?? MAX_ITERATIONS;
		checkIterations(iterations);
		const salt = randomBytes(SALT_BYTES);
		const key = yield* derive(password, salt, iterations, options.pepper);
		return [ALGORITHM, iterations, toBase64Url(salt), toBase64Url(key)].join("$");
	});

/**
 * Checks a password against a stored hash in constant time. The length policy
 * isn't applied, so passwords set before a policy change keep working; an
 * oversized one is simply invalid. A malformed stored hash is a defect, so a
 * corrupted row can't pass as a wrong password.
 */
const verify = (
	password: string,
	stored: string,
	options: PasswordOptions = {},
): Effect.Effect<PasswordCheck> =>
	Effect.gen(function* () {
		const [algorithm, count, salt, key, extra] = stored.split("$");
		const iterations = Number(count);
		const saltBytes = fromBase64Url(salt ?? "");
		const expected = fromBase64Url(key ?? "");
		if (algorithm !== ALGORITHM || extra !== undefined || !saltBytes || !expected)
			return yield* Effect.die(new Error("Stored password hash is malformed"));
		checkIterations(iterations);
		const target = options.iterations ?? MAX_ITERATIONS;
		if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH)
			return { valid: false, needsRehash: false };
		const actual = yield* derive(password, saltBytes, iterations, options.pepper);
		return { valid: constantTimeEqual(actual, expected), needsRehash: iterations < target };
	});

/** Password hashing that runs on Workers and Bun alike (WebCrypto PBKDF2). */
export const Password = { hash, verify } as const;
