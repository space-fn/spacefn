import { expect, test } from "vite-plus/test";

import { signToken, toBase64Url, TokenError, verifyToken } from "../src/auth";

const key = "a-signing-key-that-is-long-enough-0123";
const hour = 60 * 60 * 1000;
const t0 = 1_700_000_000_000;

test("a valid token returns its claims", async () => {
	const token = await signToken({ purpose: "invite", subject: "user-7" }, key, hour, t0);
	const payload = await verifyToken(token, key, "invite", t0 + 1000);
	expect(payload).toMatchObject({ purpose: "invite", subject: "user-7", expiresAt: t0 + hour });
	expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
});

test("every token has its own id", async () => {
	const a = await verifyToken(
		await signToken({ purpose: "p", subject: "s" }, key, hour, t0),
		key,
		"p",
		t0,
	);
	const b = await verifyToken(
		await signToken({ purpose: "p", subject: "s" }, key, hour, t0),
		key,
		"p",
		t0,
	);
	expect(a.jti).not.toBe(b.jti);
});

test("refuses an expired token", async () => {
	const token = await signToken({ purpose: "reset", subject: "u" }, key, hour, t0);
	await expect(verifyToken(token, key, "reset", t0 + hour)).rejects.toThrow("expired");
});

test("refuses a token used for another purpose", async () => {
	const token = await signToken({ purpose: "invite", subject: "u" }, key, hour, t0);
	await expect(verifyToken(token, key, "reset", t0)).rejects.toThrow("different purpose");
});

test("refuses a tampered payload or a different key", async () => {
	const token = await signToken({ purpose: "invite", subject: "user-1" }, key, hour, t0);
	const [, signature] = token.split(".");
	const forged = Buffer.from(
		JSON.stringify({ purpose: "invite", subject: "admin", jti: "x", expiresAt: t0 + hour }),
	).toString("base64url");
	await expect(verifyToken(`${forged}.${signature}`, key, "invite", t0)).rejects.toThrow(
		"signature is invalid",
	);
	await expect(
		verifyToken(token, "another-key-that-is-long-enough-0123456", "invite", t0),
	).rejects.toThrow("signature is invalid");
});

test("refuses malformed tokens", async () => {
	await expect(verifyToken("nope", key, "x", t0)).rejects.toThrow("malformed");
	await expect(verifyToken("a.b.c", key, "x", t0)).rejects.toThrow("malformed");
});

test("refuses a short signing key", async () => {
	await expect(signToken({ purpose: "p", subject: "s" }, "short", hour, t0)).rejects.toThrow(
		TokenError,
	);
	await expect(signToken({ purpose: "p", subject: "s" }, "short", hour, t0)).rejects.toThrow(
		"at least 32",
	);
});

test("refuses a signed token with no expiry field", async () => {
	const body = toBase64Url(
		new TextEncoder().encode(JSON.stringify({ purpose: "invite", subject: "t", jti: "1" })),
	);
	const imported = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = new Uint8Array(
		await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(body)),
	);
	const token = `${body}.${toBase64Url(sig)}`;
	// Even at the end of time such a token must not be accepted.
	await expect(verifyToken(token, key, "invite", Number.MAX_SAFE_INTEGER)).rejects.toThrow(
		/no expiry/,
	);
});
