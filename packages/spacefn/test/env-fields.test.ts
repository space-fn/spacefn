import { describe, expect, expectTypeOf, test } from "vitest";

import { boolean, defineEnv, number, secret, string, type InferEnv } from "../src/env";

describe("field builders", () => {
	test("describe their kind and flags", () => {
		expect(string()).toMatchObject({ kind: "string", secret: false, optional: false });
		expect(number({ default: 3 })).toMatchObject({ kind: "number", default: 3 });
		expect(boolean({ optional: true })).toMatchObject({ kind: "boolean", optional: true });
		expect(secret()).toMatchObject({ kind: "string", secret: true });
	});

	test("defineEnv returns the schema unchanged", () => {
		const schema = { A: string() };
		expect(defineEnv(schema)).toBe(schema);
	});
});

describe("InferEnv", () => {
	const schema = defineEnv({
		NAME: string(),
		GREETING: string({ default: "hi" }),
		NOTE: string({ optional: true }),
		LIMIT: number({ default: 10 }),
		DEBUG: boolean({ default: false }),
		TOKEN: secret(),
		HOOK: secret({ optional: true }),
	});

	test("maps fields to value types", () => {
		expectTypeOf<InferEnv<typeof schema>>().toEqualTypeOf<{
			readonly NAME: string;
			readonly GREETING: string;
			readonly NOTE: string | undefined;
			readonly LIMIT: number;
			readonly DEBUG: boolean;
			readonly TOKEN: string;
			readonly HOOK: string | undefined;
		}>();
	});
});
