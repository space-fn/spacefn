import { expect, test } from "vite-plus/test";

import { constantTimeEqual, fromBase64Url, toBase64Url } from "../src/auth/encoding";

test("toBase64Url/fromBase64Url round-trip", () => {
	const bytes = new Uint8Array([0, 1, 2, 254, 255, 10, 20, 30]);
	const enc = toBase64Url(bytes);
	expect(fromBase64Url(enc)).toEqual(bytes);
});

test("toBase64Url uses url-safe alphabet", () => {
	const bytes = new Uint8Array([251, 255]); // produces + and / in standard base64
	const enc = toBase64Url(bytes);
	expect(enc).not.toContain("+");
	expect(enc).not.toContain("/");
	expect(enc).not.toContain("=");
});

test("fromBase64Url rejects characters outside the url-safe alphabet", () => {
	expect(() => fromBase64Url("abc+")).toThrow();
	expect(() => fromBase64Url("ab=c")).toThrow();
	expect(() => fromBase64Url("%%%")).toThrow();
	expect(() => fromBase64Url("abcde")).toThrow();
});

test("constantTimeEqual", () => {
	expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
	expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
	expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
});
