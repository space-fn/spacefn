import { expect, test } from "vite-plus/test";

import {
	constantTimeEqual,
	fromBase64Url,
	hashPassword,
	hibpBreachCheck,
	MAX_ITERATIONS,
	MIN_PASSWORD_LENGTH,
	toBase64Url,
	verifyPassword,
	type BreachCheck,
} from "../src/auth";

test("base64url round-trips bytes without padding or + and /", () => {
	const bytes = Uint8Array.from([0, 1, 254, 255, 63, 62]);
	const text = toBase64Url(bytes);
	expect(text).not.toMatch(/[+/=]/);
	expect(fromBase64Url(text)).toEqual(bytes);
});

test("constant-time equality compares every byte and the length", () => {
	expect(constantTimeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
	expect(constantTimeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
	expect(constantTimeEqual(Uint8Array.from([1]), Uint8Array.from([1, 2]))).toBe(false);
});

test("a hash records its algorithm and iteration count", async () => {
	const stored = await hashPassword("correct horse", { iterations: 1000 });
	const [algorithm, count, salt, hash] = stored.split("$");
	expect(algorithm).toBe("pbkdf2-sha256");
	expect(count).toBe("1000");
	expect(fromBase64Url(salt as string)).toHaveLength(16);
	expect(fromBase64Url(hash as string)).toHaveLength(32);
});

test("the same password gets a different salt each time", async () => {
	const a = await hashPassword("same-password", { iterations: 1000 });
	const b = await hashPassword("same-password", { iterations: 1000 });
	expect(a).not.toBe(b);
});

test("verifies the right password and rejects the wrong one", async () => {
	const stored = await hashPassword("correct horse", { iterations: 1000 });
	expect(await verifyPassword("correct horse", stored, { iterations: 1000 })).toEqual({
		valid: true,
		needsRehash: false,
	});
	expect((await verifyPassword("battery staple", stored, { iterations: 1000 })).valid).toBe(false);
});

test("flags a hash made with fewer iterations than the current target", async () => {
	const old = await hashPassword("pw-long-enough", { iterations: 1000 });
	expect((await verifyPassword("pw-long-enough", old, { iterations: 5000 })).needsRehash).toBe(
		true,
	);
	expect((await verifyPassword("pw-long-enough", old, { iterations: 1000 })).needsRehash).toBe(
		false,
	);
});

test("defaults to the production iteration limit", async () => {
	expect(MAX_ITERATIONS).toBe(100_000);
	const stored = await hashPassword("pw-long-enough");
	expect(stored.split("$")[1]).toBe("100000");
});

test("refuses iteration counts the runtime does not accept", async () => {
	await expect(hashPassword("pw-long-enough", { iterations: 600_000 })).rejects.toThrow(
		"from 1 to 100000",
	);
	await expect(hashPassword("pw-long-enough", { iterations: 0 })).rejects.toThrow(
		"from 1 to 100000",
	);
});

test("refuses empty and oversized passwords", async () => {
	await expect(hashPassword("")).rejects.toThrow("must not be empty");
	await expect(hashPassword("x".repeat(1025))).rejects.toThrow("at most 1024");
});

test("a malformed stored hash is an error, never a quiet failure", async () => {
	await expect(verifyPassword("pw", "not-a-hash")).rejects.toThrow("malformed");
	await expect(verifyPassword("pw", "pbkdf2-sha256$abc$x$y")).rejects.toThrow();
	await expect(verifyPassword("pw", "bcrypt$10$x$y")).rejects.toThrow("malformed");
});

test("a stored count above the runtime limit is refused, not silently accepted", async () => {
	await expect(
		verifyPassword("pw", "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAA"),
	).rejects.toThrow("from 1 to 100000");
});

test("refuses passwords shorter than the minimum at the boundary", async () => {
	expect(MIN_PASSWORD_LENGTH).toBe(12);
	await expect(hashPassword("x".repeat(11))).rejects.toThrow("at least 12");
	await expect(hashPassword("x".repeat(12), { iterations: 1000 })).resolves.toBeDefined();
});

test("a password set before the length policy still verifies", async () => {
	const salt = new Uint8Array(16).fill(7);
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode("pw"),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: "PBKDF2", salt, iterations: 1000, hash: "SHA-256" },
			key,
			256,
		),
	);
	const stored = `pbkdf2-sha256$1000$${toBase64Url(salt)}$${toBase64Url(bits)}`;
	expect((await verifyPassword("pw", stored, { iterations: 1000 })).valid).toBe(true);
});

test("a pepper is needed to verify what it hashed", async () => {
	const pepper = "server-secret-outside-the-database";
	const stored = await hashPassword("correct horse", { iterations: 1000, pepper });
	expect((await verifyPassword("correct horse", stored, { iterations: 1000, pepper })).valid).toBe(
		true,
	);
	expect((await verifyPassword("correct horse", stored, { iterations: 1000 })).valid).toBe(false);
	expect(
		(await verifyPassword("correct horse", stored, { iterations: 1000, pepper: "other" })).valid,
	).toBe(false);
});

test("a breach check refuses a known password", async () => {
	const breachCheck: BreachCheck = { isBreached: async (p) => p === "correct horse" };
	await expect(hashPassword("correct horse", { iterations: 1000, breachCheck })).rejects.toThrow(
		"breach",
	);
	await expect(
		hashPassword("a-fresh-password", { iterations: 1000, breachCheck }),
	).resolves.toBeDefined();
});

test("the HIBP check sends only a hash prefix and fails open", async () => {
	const password = "correct horse";
	const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();

	let asked = "";
	const found = hibpBreachCheck(async (input: RequestInfo | URL) => {
		asked = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		return new Response(`${hex.slice(5)}:4`);
	});
	expect(await found.isBreached(password)).toBe(true);
	expect(asked).toBe(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`);
	expect(asked).not.toContain(hex.slice(5));

	const clean = hibpBreachCheck(
		async () => new Response("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3"),
	);
	expect(await clean.isBreached(password)).toBe(false);

	const down = hibpBreachCheck(async () => {
		throw new Error("network down");
	});
	expect(await down.isBreached(password)).toBe(false);
});
