import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { bindingName, pascalName, unitName } from "../src/codegen/names.ts";

describe("unitName", () => {
	it("strips the extension", () => {
		expect(Effect.runSync(unitName("queues", "order-jobs.ts"))).toBe("order-jobs");
		expect(Effect.runSync(unitName("crons", "nightly2.mts"))).toBe("nightly2");
	});

	it("rejects names that cannot be resource or binding names", () => {
		for (const file of ["Orders.ts", "order_jobs.ts", "2fa.ts", "a.b.ts"]) {
			const error = Effect.runSync(Effect.flip(unitName("queues", file)));
			expect(error.code, file).toBe("NAME_INVALID");
			expect(error.file).toBe(`app/queues/${file}`);
		}
	});
});

describe("pascalName and bindingName", () => {
	it("derive class and binding names", () => {
		expect(pascalName("chat-room")).toBe("ChatRoom");
		expect(pascalName("counter")).toBe("Counter");
		expect(bindingName("QUEUE", "order-jobs")).toBe("QUEUE_ORDER_JOBS");
		expect(bindingName("DO", "chat-room")).toBe("DO_CHAT_ROOM");
	});
});
