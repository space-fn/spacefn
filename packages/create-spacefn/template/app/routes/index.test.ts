import { describe, it, expect } from "vitest";

import { GET } from "./index";

describe("index route", () => {
	it("is defined", () => {
		expect(GET).toBeDefined();
	});
});
