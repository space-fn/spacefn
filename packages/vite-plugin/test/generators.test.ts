import { describe, it, expect } from "vitest";

import { globToRegex } from "../src/generators.js";
import { apiGenerator, pageGenerator, dbGenerator } from "../src/generators/index.js";
import { buildRoutePath, parseMethodPostfix } from "../src/utils.js";

// --- globToRegex -------------------------------------------------------------

describe("globToRegex", () => {
	it("converts simple glob to regex", () => {
		const re = globToRegex("src/api/**/*.ts");
		expect(re.test("src/api/users.ts")).toBe(true);
		expect(re.test("src/api/users/create.ts")).toBe(true);
		expect(re.test("src/pages/index.ts")).toBe(false);
	});

	it("handles dot patterns", () => {
		const re = globToRegex("src/**/*.test.ts");
		expect(re.test("src/foo.test.ts")).toBe(true);
		expect(re.test("src/foo.spec.ts")).toBe(false);
	});
});

// --- buildRoutePath ----------------------------------------------------------

describe("buildRoutePath", () => {
	it("converts file path to route", () => {
		expect(buildRoutePath("src/api/users.ts", "src/api")).toBe("/users");
	});

	it("handles index routes", () => {
		expect(buildRoutePath("src/api/index.ts", "src/api")).toBe("/");
	});

	it("converts dynamic params", () => {
		expect(buildRoutePath("src/api/users/[id].ts", "src/api")).toBe("/users/:id");
	});

	it("converts catch-all routes", () => {
		expect(buildRoutePath("src/api/[...path].ts", "src/api")).toBe("/*");
	});
});

// --- parseMethodPostfix ------------------------------------------------------

describe("parseMethodPostfix", () => {
	it("parses .get postfix", () => {
		expect(parseMethodPostfix("src/api/users.get.ts")).toBe("get");
	});

	it("parses .post postfix", () => {
		expect(parseMethodPostfix("src/api/users.post.ts")).toBe("post");
	});

	it("returns null for no method", () => {
		expect(parseMethodPostfix("src/api/users.ts")).toBeNull();
	});

	it("ignores non-HTTP methods", () => {
		expect(parseMethodPostfix("src/api/users.custom.ts")).toBeNull();
	});
});

// --- generators (return Vite PluginOption) -----------------------------------

describe("apiGenerator", () => {
	it("returns a Vite plugin", () => {
		const plugin = apiGenerator();
		expect(plugin).toBeDefined();
		expect(typeof plugin).toBe("object");
	});

	it("has generators name", () => {
		const plugin = apiGenerator() as any;
		expect(plugin.name).toBe("generators");
	});
});

describe("pageGenerator", () => {
	it("returns a Vite plugin", () => {
		const plugin = pageGenerator();
		expect(plugin).toBeDefined();
		expect(typeof plugin).toBe("object");
	});

	it("has generators name", () => {
		const plugin = pageGenerator() as any;
		expect(plugin.name).toBe("generators");
	});
});

describe("dbGenerator", () => {
	it("returns a Vite plugin", () => {
		const plugin = dbGenerator();
		expect(plugin).toBeDefined();
		expect(typeof plugin).toBe("object");
	});

	it("has generators name", () => {
		const plugin = dbGenerator() as any;
		expect(plugin.name).toBe("generators");
	});
});
