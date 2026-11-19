import { constantTimeEqual, fromBase64Url, toBase64Url } from "./encoding";

/**
 * The most PBKDF2 iterations the Workers runtime accepts in production. Higher
 * counts are rejected at run time with NotSupportedError, so this is the
 * default. It is below OWASP's current 600,000 recommendation; see docs/auth.md.
 */
export const MAX_ITERATIONS = 100_000;

const ALGORITHM = "pbkdf2-sha256";
const SALT_BYTES = 16;
const KEY_BYTES = 32;
/** Limits the work one request can ask for. */
export const MAX_PASSWORD_LENGTH = 1024;
/** The shortest password `hashPassword` accepts. */
export const MIN_PASSWORD_LENGTH = 12;

/** Checks a password against a breach corpus. */
export interface BreachCheck {
	/** True when the password is known to be breached and must not be accepted. */
	isBreached(password: string): Promise<boolean>;
}

if (
	typeof process === "undefined" ||
	(process.env?.VITEST === undefined && process.env?.NODE_ENV !== "test")
) {
	// One-time notice about the PBKDF2 cap. Workers reject >100k iterations at runtime.
	if (!(globalThis as { __spacefnPbkdf2Warned?: boolean }).__spacefnPbkdf2Warned) {
		(globalThis as { __spacefnPbkdf2Warned?: boolean }).__spacefnPbkdf2Warned = true;
		console.warn(
			"[spacefn] PBKDF2 is capped at 100,000 iterations (Workers runtime limit), below OWASP's 600,000 recommendation. " +
				"See docs/auth.md for trade-offs and Argon2 guidance.",
		);
	}
}

export interface HashOptions {
	/** Iterations for new hashes. Defaults to MAX_ITERATIONS. */
	iterations?: number;
	/**
	 * A server-side secret mixed into the derivation before the password reaches
	 * PBKDF2. Keep it outside the database (an env secret): a stolen database
	 * alone then cannot be brute-forced. Hash and verify must use the same value.
	 */
	pepper?: string;
	/** Rejects passwords found in a breach corpus. See `hibpBreachCheck`. */
	breachCheck?: BreachCheck;
}

export interface VerifyResult {
	valid: boolean;
	/** True when the hash was made with fewer iterations than `iterations` option; re-hash on next sign-in. */
	needsRehash: boolean;
}

async function derive(
	password: string,
	salt: Uint8Array,
	iterations: number,
	pepper?: string,
): Promise<Uint8Array> {
	let input: BufferSource = new TextEncoder().encode(password);
	if (pepper !== undefined) {
		const pepperKey = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(pepper),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		input = await crypto.subtle.sign("HMAC", pepperKey, input);
	}
	const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash: "SHA-256" },
		key,
		KEY_BYTES * 8,
	);
	return new Uint8Array(bits);
}

function checkPassword(password: string): void {
	if (password.length === 0) throw new Error("Password must not be empty");
	if (password.length > MAX_PASSWORD_LENGTH) {
		throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
	}
}

function checkIterations(iterations: number): void {
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
		throw new Error(
			`Iterations must be an integer from 1 to ${MAX_ITERATIONS}, the production limit`,
		);
	}
}

/**
 * Hashes a password as `pbkdf2-sha256$<iterations>$<salt>$<hash>`. The format
 * records its own parameters, so the count can change later without breaking old hashes.
 * Refuses passwords shorter than `MIN_PASSWORD_LENGTH`, and any password the
 * `breachCheck` knows.
 */
export async function hashPassword(password: string, options: HashOptions = {}): Promise<string> {
	checkPassword(password);
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
	}
	if (options.breachCheck && (await options.breachCheck.isBreached(password))) {
		throw new Error("Password appears in a data breach. Choose a different one");
	}
	const iterations = options.iterations ?? MAX_ITERATIONS;
	checkIterations(iterations);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, iterations, options.pepper);
	return [ALGORITHM, iterations, toBase64Url(salt), toBase64Url(hash)].join("$");
}

/**
 * Checks a password against a stored hash in constant time. A malformed hash
 * is an error, not a silent failure, so a corrupted row cannot pass as a wrong password.
 * The minimum length is not enforced here: passwords set before a policy change
 * must still work.
 */
export async function verifyPassword(
	password: string,
	stored: string,
	options: HashOptions = {},
): Promise<VerifyResult> {
	checkPassword(password);
	const [algorithm, count, salt, hash, extra] = stored.split("$");
	if (algorithm !== ALGORITHM || !count || !salt || !hash || extra !== undefined) {
		throw new Error("Stored password hash is malformed");
	}
	const iterations = Number(count);
	checkIterations(iterations);
	const expected = fromBase64Url(hash);
	const actual = await derive(password, fromBase64Url(salt), iterations, options.pepper);
	const target = options.iterations ?? MAX_ITERATIONS;
	return {
		valid: constantTimeEqual(actual, expected),
		needsRehash: iterations < target,
	};
}

/**
 * Checks passwords against the Have I Been Pwned range API with k-anonymity:
 * only the first five hex characters of the password's SHA-1 leave the process.
 * A failed request lets the password through, so the API being down does not
 * block sign-ups.
 */
export function hibpBreachCheck(fetchImpl: typeof fetch = fetch): BreachCheck {
	return {
		async isBreached(password: string): Promise<boolean> {
			try {
				const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
				const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
					.join("")
					.toUpperCase();
				const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`);
				if (!response.ok) return false;
				const body = await response.text();
				return body.split("\n").some((line) => line.startsWith(hex.slice(5)));
			} catch {
				return false;
			}
		},
	};
}
