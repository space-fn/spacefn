import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
	BadRequest,
	Conflict,
	Forbidden,
	formatSpaceError,
	httpStatus,
	isHttpError,
	NotFound,
	PayloadTooLarge,
	SpaceError,
	TooManyRequests,
	Unauthorized,
	UnsupportedMediaType,
} from "../src/errors.ts";

describe("httpStatus", () => {
	it("maps each HTTP error to its status", () => {
		expect(
			[
				new BadRequest({ message: "x" }),
				new Unauthorized({}),
				new Forbidden({}),
				new NotFound({}),
				new Conflict({ message: "x" }),
				new PayloadTooLarge({ limitBytes: 1 }),
				new UnsupportedMediaType({ message: "x" }),
				new TooManyRequests({}),
			].map(httpStatus),
		).toEqual([400, 401, 403, 404, 409, 413, 415, 429]);
	});

	it("treats anything else as a 500", () => {
		expect(
			[new Error("boom"), "nope", null, { _tag: "Other" }, { _tag: "toString" }].map(httpStatus),
		).toEqual([500, 500, 500, 500, 500]);
		expect(isHttpError(new SpaceError({ code: "X", message: "y" }))).toBe(false);
	});
});

describe("tagged errors", () => {
	it.effect("can be caught by tag", () =>
		Effect.gen(function* () {
			const result = yield* Effect.fail(new NotFound({ message: "no todo 7" })).pipe(
				Effect.catchTag("NotFound", (e) => Effect.succeed(`caught: ${e.message}`)),
			);
			expect(result).toBe("caught: no todo 7");
		}),
	);

	it("round-trip through their schema, e.g. across Durable Object RPC", () => {
		const error = new BadRequest({
			message: "invalid",
			issues: [{ path: "title", message: "required" }],
		});
		const encoded = Schema.encodeSync(BadRequest)(error);
		const decoded = Schema.decodeUnknownSync(BadRequest)(JSON.parse(JSON.stringify(encoded)));
		expect(decoded).toBeInstanceOf(BadRequest);
		expect(decoded.issues).toEqual([{ path: "title", message: "required" }]);
	});
});

describe("formatSpaceError", () => {
	it("prints the code, file, message and hint", () => {
		const error = new SpaceError({
			code: "CONFIG",
			message: "bad target",
			file: "configs/space.ts",
			hint: "Use cloudflare or bun.",
		});
		expect(formatSpaceError(error)).toBe(
			"[CONFIG] configs/space.ts: bad target\n  hint: Use cloudflare or bun.",
		);
		expect(formatSpaceError(new SpaceError({ code: "X", message: "y" }))).toBe("[X] y");
	});
});
