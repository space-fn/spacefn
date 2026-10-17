import { expect, test } from "vitest";

import { version } from "../src/index";

test("exports a version", () => {
	expect(version).toBe("0.0.0");
});
