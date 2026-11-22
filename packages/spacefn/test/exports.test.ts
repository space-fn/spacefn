import { describe, expect, it } from "@effect/vitest";

import * as spacefn from "../src/index.ts";
import * as libsqlEntry from "../src/libsql.ts";
import * as runtime from "../src/runtime.ts";
import * as testing from "../src/testing.ts";

describe("public exports", () => {
	it("gives app code the HTTP API", () => {
		for (const name of ["route", "middleware", "csrf", "Input", "Upload", "redirect"] as const)
			expect(spacefn[name], name).toBeDefined();
	});

	it("gives app code pages, HTML and Datastar", () => {
		for (const name of ["page", "action", "html", "raw", "Datastar"] as const)
			expect(spacefn[name], name).toBeDefined();
	});

	it("gives targets and generated code the HTTP and database runtime", () => {
		for (const name of [
			"httpLayer",
			"database",
			"transactional",
			"libsqlFromConfig",
			"applyMigrations",
		] as const)
			expect(runtime[name], name).toBeTypeOf("function");
	});

	it("gives app code libSQL over HTTP, for databases it opens itself", () => {
		expect(libsqlEntry.libsql).toBeTypeOf("function");
	});

	it("gives tests an in-memory database", () => {
		expect(testing.testDb).toBeTypeOf("function");
	});
});
