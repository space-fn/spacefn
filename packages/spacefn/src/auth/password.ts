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

export interface HashOptions {
	/** Iterations for new hashes. Defaults to MAX_ITERATIONS. */
	iterations?: number;
}

export interface VerifyResult {
	valid: boolean;
	/** True when the hash was made with fewer iterations than `iterations` option; re-hash on next sign-in. */
	needsRehash: boolean;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
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
 */
export async function hashPassword(password: string, options: HashOptions = {}): Promise<string> {
	checkPassword(password);
	const iterations = options.iterations ?? MAX_ITERATIONS;
	checkIterations(iterations);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, iterations);
	return [ALGORITHM, iterations, toBase64Url(salt), toBase64Url(hash)].join("$");
}

/**
 * Checks a password against a stored hash in constant time. A malformed hash
 * is an error, not a silent failure, so a corrupted row cannot pass as a wrong password.
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
	const actual = await derive(password, fromBase64Url(salt), iterations);
	const target = options.iterations ?? MAX_ITERATIONS;
	return {
		valid: constantTimeEqual(actual, expected),
		needsRehash: iterations < target,
	};
}
