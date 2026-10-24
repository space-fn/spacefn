import { bindings } from "cf/config";
import { describe, expect, test } from "vite-plus/test";

import { envBindings } from "../src/cloudflare";
import { boolean, defineEnv, number, secret, string } from "../src/env";

describe("envBindings", () => {
	const schema = defineEnv({
		GREETING: string({ default: "hi" }),
		LIMIT: number({ default: 10 }),
		DEBUG: boolean({ default: false }),
		NAME: string(),
		NOTE: string({ optional: true }),
		TOKEN: secret(),
	});

	test("declares defaults as text and everything else as secrets", () => {
		expect(envBindings(schema)).toEqual({
			GREETING: bindings.text("hi"),
			LIMIT: bindings.text("10"),
			DEBUG: bindings.text("false"),
			NAME: bindings.secret(),
			NOTE: bindings.secret(),
			TOKEN: bindings.secret(),
		});
	});
});
