import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { TestClock } from "effect/testing";

import { SignedToken } from "../src/auth/signed-token.ts";
import { base32Decode, base32Encode, Totp } from "../src/auth/totp.ts";

/** RFC 6238 test secret: the ASCII string "12345678901234567890". */
const rfcSecret = base32Encode(new TextEncoder().encode("12345678901234567890"));

const codeAt = (millis: number) =>
	Effect.gen(function* () {
		yield* TestClock.setTime(millis);
		return yield* Totp.code(rfcSecret);
	});

describe("Totp", () => {
	it("round-trips base32 as in RFC 4648", () => {
		expect(base32Encode(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
		expect(new TextDecoder().decode(base32Decode("mzxw 6ytb oi"))).toBe("foobar");
		expect(base32Decode("not base32!")).toBeUndefined();
	});

	it.effect("matches the RFC 6238 SHA-1 vectors, to six digits", () =>
		Effect.gen(function* () {
			expect(yield* codeAt(59_000)).toBe("287082");
			expect(yield* codeAt(1_111_111_109_000)).toBe("081804");
			expect(yield* codeAt(1_234_567_890_000)).toBe("005924");
		}),
	);

	it.effect("accepts a step of drift and refuses replays", () =>
		Effect.gen(function* () {
			const previous = yield* codeAt(1_234_567_860_000);
			yield* TestClock.setTime(1_234_567_890_000);
			const check = yield* Totp.verify(previous, Redacted.make(rfcSecret));
			expect(check.valid).toBe(true);
			expect(yield* Totp.verify(previous, rfcSecret, { afterStep: check.step! })).toEqual({
				valid: false,
			});
			expect(yield* Totp.verify(previous, rfcSecret, { window: 0 })).toEqual({ valid: false });
			expect((yield* Totp.verify("000000", rfcSecret)).valid).toBe(false);
		}),
	);

	it("builds the otpauth URI and new 160-bit secrets", () => {
		expect(Totp.uri({ secret: "JBSWY3DP", issuer: "Space", account: "ada@example.com" })).toBe(
			"otpauth://totp/Space%3Aada%40example.com?secret=JBSWY3DP&issuer=Space&algorithm=SHA1&digits=6&period=30",
		);
		expect(base32Decode(Totp.newSecret())).toHaveLength(20);
	});
});

describe("SignedToken", () => {
	const secret = Redacted.make("a-secret-that-is-long-enough-123456");

	it.effect("signs and verifies purpose, subject and expiry", () =>
		Effect.gen(function* () {
			const token = yield* SignedToken.sign(
				{ purpose: "reset", subject: "user-1" },
				secret,
				"1 hour",
			);
			const claims = yield* SignedToken.verify(token, secret, "reset");
			expect(claims).toMatchObject({ purpose: "reset", subject: "user-1", expiresAt: 3_600_000 });
			expect(claims.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);

			expect(yield* Effect.flip(SignedToken.verify(token, secret, "invite"))).toMatchObject({
				reason: "purpose",
			});
			yield* TestClock.adjust("1 hour");
			expect(yield* Effect.flip(SignedToken.verify(token, secret, "reset"))).toMatchObject({
				reason: "expired",
			});
		}),
	);

	it.effect("refuses forged and malformed tokens", () =>
		Effect.gen(function* () {
			const token = yield* SignedToken.sign(
				{ purpose: "reset", subject: "user-1" },
				secret,
				"1 hour",
			);
			const [body, signature] = token.split(".");
			const forgedBody = btoa(
				JSON.stringify({ purpose: "reset", subject: "admin", jti: "x", expiresAt: 9e15 }),
			).replace(/=+$/, "");
			for (const [bad, reason] of [
				[`${forgedBody}.${signature}`, "signature"],
				[`${body}.${signature}x`, "signature"],
				["nodot", "malformed"],
				[`${body}.${signature}.extra`, "malformed"],
			] as const)
				expect(yield* Effect.flip(SignedToken.verify(bad, secret, "reset")), bad).toMatchObject({
					reason,
				});
			const other = yield* Effect.flip(
				SignedToken.verify(token, "another-secret-long-enough-1234567890", "reset"),
			);
			expect(other.reason).toBe("signature");
		}),
	);
});
