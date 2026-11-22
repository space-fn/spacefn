import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { compareRoutePaths, parseRoutePath } from "../src/codegen/route-path.ts";

const parse = (file: string) => Effect.runSync(parseRoutePath(file));
const parseError = (file: string) => Effect.runSync(Effect.flip(parseRoutePath(file)));

describe("parseRoutePath", () => {
	it.each([
		["index.ts", "/", []],
		["hello.ts", "/hello", []],
		["api/hello.ts", "/api/hello", []],
		["api/users/index.ts", "/api/users", []],
		["api/users/[id].ts", "/api/users/:id", ["id"]],
		[
			"api/users/[userId]/posts/[post_id].ts",
			"/api/users/:userId/posts/:post_id",
			["userId", "post_id"],
		],
		["(admin)/users.ts", "/users", []],
		["a/(g)/b.mts", "/a/b", []],
		["page.tsx", "/page", []],
	])("%s -> %s", (file, path, params) => {
		expect(parse(file)).toEqual({ path, params });
	});

	it("maps a catch-all to the router's * and keeps its name", () => {
		expect(parse("files/[...path].ts")).toEqual({
			path: "/files/*",
			params: ["path"],
			catchAll: "path",
		});
	});

	it("reads the mode suffix", () => {
		expect(parse("debug.dev.ts")).toMatchObject({ path: "/debug", mode: "dev" });
		expect(parse("api/metrics.prod.ts")).toMatchObject({ path: "/api/metrics", mode: "prod" });
	});

	it("skips private, test and non-code files", () => {
		for (const file of [
			"_helpers.ts",
			"api/_shared/util.ts",
			"a.test.ts",
			"b.spec.tsx",
			"readme.md",
		])
			expect(parse(file), file).toBeNull();
	});

	it("rejects brackets that are not a parameter, naming the file", () => {
		for (const file of ["users/[user id].ts", "users/[].ts", "users/[user-id].ts", "x[id].ts"]) {
			const error = parseError(file);
			expect(error.code, file).toBe("ROUTE_BAD_SEGMENT");
			expect(error.file).toBe(file);
		}
	});

	it("rejects a catch-all that is not the last segment", () => {
		expect(parseError("[...rest]/edit.ts").message).toMatch(/last segment/);
	});
});

describe("compareRoutePaths", () => {
	it("orders static before :param before *, segment by segment", () => {
		const paths = ["/*", "/users/:id", "/", "/users/me", "/users", "/users/:id/edit"];
		expect(
			paths
				.map((path) => ({ path }))
				.sort(compareRoutePaths)
				.map((r) => r.path),
		).toEqual(["/", "/users", "/users/me", "/users/:id", "/users/:id/edit", "/*"]);
	});
});
