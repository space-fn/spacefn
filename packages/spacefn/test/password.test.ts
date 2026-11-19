import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";

import { constantTimeEqual, fromBase64Url, toBase64Url } from "../src/auth/encoding.ts";
import { MAX_ITERATIONS, Password } from "../src/auth/password.ts";

const fast = { iterations: 1000 };

describe("encoding", () => {
	it("round-trips base64url without padding, + or /", () => {
		const bytes = Uint8Array.from([0, 1, 254, 255, 63, 62]);
		const text = toBase64Url(bytes);
		expect(text).not.toMatch(/[+/=]/);
		expect(fromBase64Url(text)).toEqual(bytes);
		expect(fromBase64Url("not base64!")).toBeUndefined();
		expect(fromBase64Url("a")).toBeUndefined();
	});

	it("compares every byte and the length", () => {
		expect(constantTimeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
		expect(constantTimeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
		expect(constantTimeEqual(Uint8Array.from([1]), Uint8Array.from([1, 2]))).toBe(false);
	});
});

describe("Password", () => {
	it.effect("records the algorithm and iterations, with a fresh salt each time", () =>
		Effect.gen(function* () {
			const a = yield* Password.hash("correct horse battery", fast);
			const b = yield* Password.hash("correct horse battery", fast);
			const [algorithm, count, salt, key] = a.split("$");
			expect([algorithm, count]).toEqual(["pbkdf2-sha256", "1000"]);
			expect(fromBase64Url(salt!)).toHaveLength(16);
			expect(fromBase64Url(key!)).toHaveLength(32);
			expect(a).not.toBe(b);
		}),
	);

	it.effect("verifies the right password and rejects others", () =>
		Effect.gen(function* () {
			const stored = yield* Password.hash("correct horse battery", fast);
			expect(yield* Password.verify("correct horse battery", stored, fast)).toEqual({
				valid: true,
				needsRehash: false,
			});
			expect((yield* Password.verify("battery staple horse", stored, fast)).valid).toBe(false);
			expect((yield* Password.verify("", stored, fast)).valid).toBe(false);
			expect((yield* Password.verify("x".repeat(2000), stored, fast)).valid).toBe(false);
		}),
	);

	it.effect("flags hashes below the target iterations for a rehash", () =>
		Effect.gen(function* () {
			const old = yield* Password.hash("correct horse battery", fast);
			expect(
				(yield* Password.verify("correct horse battery", old, { iterations: 5000 })).needsRehash,
			).toBe(true);
		}),
	);

	it.effect("mixes in the pepper", () =>
		Effect.gen(function* () {
			const stored = yield* Password.hash("correct horse battery", { ...fast, pepper: "s1" });
			expect(
				(yield* Password.verify("correct horse battery", stored, { ...fast, pepper: "s1" })).valid,
			).toBe(true);
			expect(
				(yield* Password.verify("correct horse battery", stored, { ...fast, pepper: "s2" })).valid,
			).toBe(false);
		}),
	);

	it.effect("refuses passwords outside the length policy", () =>
		Effect.gen(function* () {
			expect(yield* Effect.flip(Password.hash("short"))).toMatchObject({
				_tag: "WeakPassword",
				reason: "too-short",
			});
			expect(yield* Effect.flip(Password.hash("x".repeat(1025)))).toMatchObject({
				reason: "too-long",
			});
		}),
	);

	it.effect("defaults to the Workers limit and dies on a malformed stored hash", () =>
		Effect.gen(function* () {
			expect(MAX_ITERATIONS).toBe(100_000);
			expect((yield* Password.hash("correct horse battery")).split("$")[1]).toBe("100000");
			const exit = yield* Effect.exit(Password.verify("correct horse battery", "md5$x"));
			expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
		}),
	);
});
