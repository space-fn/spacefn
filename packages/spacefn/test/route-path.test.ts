import { describe, expect, test } from "vite-plus/test";

import { parseRoutePath } from "../src/routes/path";

describe("parseRoutePath", () => {
	test.each([
		["index.ts", "/"],
		["hello.ts", "/hello"],
		["api/hello.ts", "/api/hello"],
		["api/users/index.ts", "/api/users"],
		["api/users/[id].ts", "/api/users/:id"],
		["api/users/[user-id].ts", "/api/users/:user-id"],
		["api/search/[...query].ts", "/api/search/:query{.+}"],
		["api/files/[...file-name].ts", "/api/files/:file-name{.+}"],
		["(admin)/users.ts", "/users"],
		["a/(g)/b.mts", "/a/b"],
		["page.tsx", "/page"],
	])("%s -> %s", (file, path) => {
		expect(parseRoutePath(file)).toEqual({ path });
	});

	test("reads the environment suffix", () => {
		expect(parseRoutePath("debug.dev.ts")).toEqual({ path: "/debug", env: "dev" });
		expect(parseRoutePath("api/metrics.prod.ts")).toEqual({ path: "/api/metrics", env: "prod" });
	});

	test("ignores files and folders starting with underscore", () => {
		expect(parseRoutePath("_helpers.ts")).toBeNull();
		expect(parseRoutePath("api/_shared/util.ts")).toBeNull();
	});

	test("ignores non-code files", () => {
		expect(parseRoutePath("readme.md")).toBeNull();
	});

	test("refuses a bracket segment that is not a valid parameter", () => {
		expect(() => parseRoutePath("users/[user id].ts")).toThrow(/not a valid parameter/);
		expect(() => parseRoutePath("users/[].ts")).toThrow(/not a valid parameter/);
	});
});
