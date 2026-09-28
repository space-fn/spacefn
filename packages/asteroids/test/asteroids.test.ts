import { describe, it, expect } from "vitest";

import { h, render, css, ds, defineSchema, column, migrate } from "../src/index.js";

describe("asteroids re-exports", () => {
	it("re-exports html functions", () => {
		expect(typeof h).toBe("object");
		expect(typeof h.div).toBe("function");
		expect(typeof render).toBe("function");
	});

	it("re-exports css functions", () => {
		expect(typeof css).toBe("function");
	});

	it("re-exports datastar functions", () => {
		expect(typeof ds).toBe("object");
		expect(typeof ds.dataText).toBe("function");
	});

	it("re-exports db functions", () => {
		expect(typeof defineSchema).toBe("function");
		expect(typeof column).toBe("object");
		expect(typeof migrate).toBe("function");
	});
});
