import { expect, test } from "vite-plus/test";

import {
	base32Decode,
	base32Encode,
	newTotpSecret,
	otpauthUri,
	totpAt,
	verifyTotp,
} from "../src/auth";

/** RFC 6238 test secret: the ASCII string "12345678901234567890". */
const rfcSecret = base32Encode(new TextEncoder().encode("12345678901234567890"));

test("base32 round-trips and matches RFC 4648", () => {
	expect(base32Encode(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
	expect(new TextDecoder().decode(base32Decode("MZXW6YTBOI"))).toBe("foobar");
	expect(base32Decode("mzxw6ytboi")).toEqual(base32Decode("MZXW6YTBOI"));
});

test("matches the RFC 6238 SHA-1 test vectors, to six digits", async () => {
	expect(await totpAt(rfcSecret, 59_000)).toBe("287082");
	expect(await totpAt(rfcSecret, 1_111_111_109_000)).toBe("081804");
	expect(await totpAt(rfcSecret, 1_234_567_890_000)).toBe("005924");
});

test("a fresh secret is 160 bits, base32", () => {
	const secret = newTotpSecret();
	expect(secret).toMatch(/^[A-Z2-7]{32}$/);
	expect(base32Decode(secret)).toHaveLength(20);
});

test("accepts the current code and reports its step", async () => {
	const at = 1_234_567_890_000;
	const code = await totpAt(rfcSecret, at);
	expect(await verifyTotp(code, rfcSecret, at)).toEqual({
		valid: true,
		step: Math.floor(at / 30_000),
	});
});

test("accepts one step of clock drift either way, but not two", async () => {
	const at = 1_234_567_890_000;
	const previous = await totpAt(rfcSecret, at - 30_000);
	const twoBack = await totpAt(rfcSecret, at - 60_000);
	expect((await verifyTotp(previous, rfcSecret, at)).valid).toBe(true);
	expect((await verifyTotp(twoBack, rfcSecret, at)).valid).toBe(false);
});

test("refuses a code whose step was already used", async () => {
	const at = 1_234_567_890_000;
	const code = await totpAt(rfcSecret, at);
	const step = Math.floor(at / 30_000);
	expect((await verifyTotp(code, rfcSecret, at, { afterStep: step })).valid).toBe(false);
	expect((await verifyTotp(code, rfcSecret, at, { afterStep: step - 1 })).valid).toBe(true);
});

test("rejects wrong codes and invalid secrets", async () => {
	expect((await verifyTotp("000000", rfcSecret, 59_000)).valid).toBe(false);
	expect(() => base32Decode("NOT BASE32!")).toThrow("not valid base32");
});

test("builds an otpauth URI for authenticator apps", () => {
	const uri = otpauthUri({ secret: "ABC", issuer: "Space App", account: "ada@example.com" });
	expect(uri).toBe(
		"otpauth://totp/Space%20App%3Aada%40example.com?secret=ABC&issuer=Space+App&algorithm=SHA1&digits=6&period=30",
	);
});
