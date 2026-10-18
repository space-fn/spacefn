import { expect, test } from "vite-plus/test";

import {
  constantTimeEqual,
  fromBase64Url,
  hashPassword,
  MAX_ITERATIONS,
  toBase64Url,
  verifyPassword,
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
  const a = await hashPassword("same", { iterations: 1000 });
  const b = await hashPassword("same", { iterations: 1000 });
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
  const old = await hashPassword("pw", { iterations: 1000 });
  expect((await verifyPassword("pw", old, { iterations: 5000 })).needsRehash).toBe(true);
  expect((await verifyPassword("pw", old, { iterations: 1000 })).needsRehash).toBe(false);
});

test("defaults to the production iteration limit", async () => {
  expect(MAX_ITERATIONS).toBe(100_000);
  const stored = await hashPassword("pw");
  expect(stored.split("$")[1]).toBe("100000");
});

test("refuses iteration counts the runtime does not accept", async () => {
  await expect(hashPassword("pw", { iterations: 600_000 })).rejects.toThrow("from 1 to 100000");
  await expect(hashPassword("pw", { iterations: 0 })).rejects.toThrow("from 1 to 100000");
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
