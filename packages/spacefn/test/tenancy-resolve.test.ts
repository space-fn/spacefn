import { expect, test } from "vite-plus/test";

import { decideTenant, slugFromRequest, type TenantRecord } from "../src/tenancy";

const base = "yourapp.com";
const active: TenantRecord = { slug: "acme", internalId: "7c9e", status: "active" };

test("the header names the tenant, even when the host also does", () => {
	expect(slugFromRequest({ header: "Beta", host: "acme.yourapp.com", baseDomain: base })).toBe(
		"beta",
	);
});

test("a single label above the base domain names the tenant", () => {
	expect(slugFromRequest({ host: "acme.yourapp.com", baseDomain: base })).toBe("acme");
	expect(slugFromRequest({ host: "acme.yourapp.com:8787", baseDomain: base })).toBe("acme");
});

test("www, deeper labels, the bare domain and other domains name no tenant", () => {
	expect(slugFromRequest({ host: "www.yourapp.com", baseDomain: base })).toBeUndefined();
	expect(slugFromRequest({ host: "eu.acme.yourapp.com", baseDomain: base })).toBeUndefined();
	expect(slugFromRequest({ host: "yourapp.com", baseDomain: base })).toBeUndefined();
	expect(slugFromRequest({ host: "acme.other.com", baseDomain: base })).toBeUndefined();
});

test("without a base domain only the header counts", () => {
	expect(slugFromRequest({ host: "acme.yourapp.com" })).toBeUndefined();
	expect(slugFromRequest({ header: "acme" })).toBe("acme");
	expect(slugFromRequest({ header: "   " })).toBeUndefined();
});

test("a missing tenant is a 400", () => {
	expect(decideTenant(undefined, undefined)).toEqual({
		ok: false,
		status: 400,
		code: "bad_request",
		message: "No tenant was named",
	});
});

test("an unknown tenant is a 404", () => {
	expect(decideTenant("nobody", undefined)).toMatchObject({
		ok: false,
		status: 404,
		code: "not_found",
	});
});

test("deleted and purged tenants look exactly like unknown ones", () => {
	const unknown = decideTenant("ghost", undefined);
	expect(decideTenant("ghost", { ...active, status: "deleted" })).toEqual(unknown);
	expect(decideTenant("ghost", { ...active, status: "purged" })).toEqual(unknown);
});

test("a suspended tenant is a 403", () => {
	expect(decideTenant("acme", { ...active, status: "suspended" })).toMatchObject({
		ok: false,
		status: 403,
	});
});

test("an active tenant is served", () => {
	expect(decideTenant("acme", active)).toEqual({ ok: true, tenant: active });
});
