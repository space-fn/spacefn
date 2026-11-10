import { expect, test } from "vite-plus/test";

import { generateExportsSource } from "../src/entry";

test("an app with no durable objects or workflows still gets a module", () => {
	// `export * from "@space/exports"` in app/entry.ts must type-check either way.
	expect(generateExportsSource()).toContain("export {};");
});

test("re-exports each durable object and workflow class", () => {
	const source = generateExportsSource({
		durableObjects: ["chat-room.ts"],
		workflows: ["order-fulfillment.ts"],
	});
	expect(source).toContain('export { ChatRoom } from "../app/durable-objects/chat-room";');
	expect(source).toContain(
		'export { OrderFulfillment } from "../app/workflows/order-fulfillment";',
	);
	expect(source).not.toContain("export {};");
});
