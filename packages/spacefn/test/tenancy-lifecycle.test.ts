import { expect, test } from "vite-plus/test";

import { GRACE_MS, isPurgeDue, transition, TenantTransitionError } from "../src/tenancy";

const day = 24 * 60 * 60 * 1000;
const t0 = 1_700_000_000_000;

test("an active tenant can be suspended and resumed", () => {
  const suspended = transition({ status: "active" }, "suspend", t0);
  expect(suspended).toEqual({ status: "suspended" });
  expect(transition(suspended, "resume", t0)).toEqual({ status: "active" });
});

test("only an active tenant can be suspended, and only a suspended one resumed", () => {
  expect(() => transition({ status: "suspended" }, "suspend", t0)).toThrow(TenantTransitionError);
  expect(() => transition({ status: "active" }, "resume", t0)).toThrow("Only a suspended tenant");
});

test("delete records when it happened, from active or suspended", () => {
  expect(transition({ status: "active" }, "delete", t0)).toEqual({
    status: "deleted",
    deletedAt: t0,
  });
  expect(transition({ status: "suspended" }, "delete", t0)).toEqual({
    status: "deleted",
    deletedAt: t0,
  });
});

test("a deleted tenant can be restored within the grace period", () => {
  const deleted = { status: "deleted" as const, deletedAt: t0 };
  expect(transition(deleted, "restore", t0 + 29 * day)).toEqual({ status: "active" });
});

test("restore is refused once the grace period has ended", () => {
  const deleted = { status: "deleted" as const, deletedAt: t0 };
  expect(() => transition(deleted, "restore", t0 + GRACE_MS)).toThrow("grace period has ended");
});

test("purged tenants cannot be changed", () => {
  expect(() => transition({ status: "purged" }, "restore", t0)).toThrow(TenantTransitionError);
  expect(() => transition({ status: "purged" }, "delete", t0)).toThrow("cannot be deleted");
});

test("purge is due only after the grace period", () => {
  const deleted = { status: "deleted" as const, deletedAt: t0 };
  expect(isPurgeDue(deleted, t0 + 30 * day - 1)).toBe(false);
  expect(isPurgeDue(deleted, t0 + GRACE_MS)).toBe(true);
  expect(isPurgeDue({ status: "active" }, t0 + 100 * day)).toBe(false);
});

test("the grace period is 30 days", () => {
  expect(GRACE_MS).toBe(30 * day);
});
