import { expect, test } from "vite-plus/test";

import { assertValidSlug, isValidSlug } from "../src/tenancy";

test.each(["acme", "acme-co", "a", "x1", "9lives", "a".repeat(63)])("accepts %s", (slug) => {
  expect(isValidSlug(slug)).toBe(true);
});

test.each(["", "-acme", "acme-", "ac me", "acme.co", "a".repeat(64), "ac_me", "ünï"])(
  "rejects %j",
  (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  },
);

test("rejects reserved names, in any case", () => {
  expect(isValidSlug("www")).toBe(false);
  expect(isValidSlug("API")).toBe(false);
});

test("normalises case and explains what is wrong", () => {
  expect(assertValidSlug("Acme")).toBe("acme");
  expect(() => assertValidSlug("admin")).toThrow('"admin" is reserved');
  expect(() => assertValidSlug("bad_slug")).toThrow("not a valid slug");
});
