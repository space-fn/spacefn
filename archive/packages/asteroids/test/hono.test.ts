import { describe, it, expect } from "vitest";

import { defineRoute, defineLoader, defineActions, definePage, html } from "../src/hono.js";
// Import h from the main asteroids entry for the html() test
import { h } from "../src/index.js";

describe("hono utilities", () => {
	it("defineRoute returns the handler", () => {
		const handler = defineRoute((_c) => new Response("ok"));
		expect(typeof handler).toBe("function");
	});

	it("defineLoader returns the loader", () => {
		const loader = defineLoader((_c) => ({ data: "test" }));
		expect(typeof loader).toBe("function");
	});

	it("defineActions adds path field", () => {
		const actions = defineActions({
			save: { method: "post", resolver: () => new Response("saved") },
			delete: { method: "post", resolver: () => new Response("deleted") },
		});

		expect(actions.save.path).toBe("?_action=save");
		expect(actions.save.method).toBe("post");
		expect(actions.delete.path).toBe("?_action=delete");
	});

	it("definePage returns the component", () => {
		const component = definePage((data: { name: string }) => data.name);
		expect(typeof component).toBe("function");
	});

	it("html returns Response with text/html", () => {
		const response = html(h.div({}, "hello"));
		expect(response).toBeInstanceOf(Response);
		expect(response.headers.get("Content-Type")).toBe("text/html");
	});
});
