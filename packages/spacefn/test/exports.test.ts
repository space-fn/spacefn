import { describe, expect, it } from "@effect/vitest";

import * as spacefn from "../src/index.ts";
import * as runtime from "../src/runtime.ts";

describe("public exports", () => {
	it("gives app code the HTTP API", () => {
		for (const name of ["route", "middleware", "csrf", "Input", "Upload"] as const)
			expect(spacefn[name], name).toBeDefined();
	});

	it("gives targets the HTTP layer", () => {
		expect(runtime.httpLayer).toBeTypeOf("function");
	});
});
