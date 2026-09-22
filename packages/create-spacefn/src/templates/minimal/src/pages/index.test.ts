import { createTestHandler } from "@spacefn/server/test";
import { describe, it, expect } from "vitest";

import Page from "./index.page";
import { loader } from "./index.server";

const handler = createTestHandler({ loader, page: Page });

describe("Home page", () => {
	it("renders with loader data", async () => {
		const res = await handler(new Request("http://localhost/"));
		const html = await res.text();

		expect(res.status).toBe(200);
		expect(html).toContain("Hello World!");
	});

	it("returns HTML content type", async () => {
		const res = await handler(new Request("http://localhost/"));
		expect(res.headers.get("Content-Type")).toBe("text/html");
	});
});
