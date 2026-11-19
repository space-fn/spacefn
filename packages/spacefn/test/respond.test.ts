import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerResponse } from "effect/http";

import { BadRequest, NotFound, TooManyRequests } from "../src/errors.ts";
import { badRequestFrom, handleErrors, toResponse } from "../src/http/respond.ts";

const web = (response: HttpServerResponse.HttpServerResponse) => HttpServerResponse.toWeb(response);

const read = async (response: Response) => ({
	status: response.status,
	type: response.headers.get("content-type"),
	body: await response.text(),
});

describe("toResponse", () => {
	it.effect("passes responses through and converts strings, undefined and values", () =>
		Effect.gen(function* () {
			const teapot = HttpServerResponse.text("tea", { status: 418 });
			expect(yield* toResponse(teapot)).toBe(teapot);
			const text = yield* Effect.promise(() => read(web(Effect.runSync(toResponse("hi")))));
			expect(text).toMatchObject({ status: 200, body: "hi" });
			expect(text.type).toContain("text/plain");
			expect((yield* toResponse(undefined)).status).toBe(204);
			const json = yield* Effect.promise(async () =>
				read(web(await Effect.runPromise(toResponse({ a: 1 })))),
			);
			expect(json).toMatchObject({ status: 200, body: '{"a":1}' });
		}),
	);
});

describe("handleErrors", () => {
	it.effect("answers tagged HTTP errors with their status and a JSON body", () =>
		Effect.gen(function* () {
			const notFound = yield* handleErrors(Effect.fail(new NotFound({ message: "No todo 7" })));
			expect(yield* Effect.promise(() => read(web(notFound)))).toEqual({
				status: 404,
				type: "application/json",
				body: '{"error":"NotFound","message":"No todo 7"}',
			});
			const limited = yield* handleErrors(
				Effect.fail(new TooManyRequests({ retryAfterSeconds: 30 })),
			);
			expect(web(limited).headers.get("retry-after")).toBe("30");
		}),
	);

	it.effect("hides other failures and defects behind an opaque 500", () =>
		Effect.gen(function* () {
			for (const failing of [
				Effect.fail(new Error("db password is hunter2")),
				Effect.die("boom"),
			]) {
				const response = yield* handleErrors(failing);
				const { status, body } = yield* Effect.promise(() => read(web(response)));
				expect(status).toBe(500);
				expect(body).not.toContain("hunter2");
				expect(JSON.parse(body)).toEqual({
					error: "InternalError",
					message: "Something went wrong",
				});
			}
		}),
	);
});

describe("badRequestFrom", () => {
	it("lists each schema issue by path", () => {
		const decoded = Schema.decodeUnknownResult(
			Schema.Struct({ user: Schema.Struct({ age: Schema.Number }) }),
		);
		const result = decoded({ user: { age: "x" } });
		if (result._tag !== "Failure") throw new Error("expected a failure");
		const error = badRequestFrom("body", result.failure);
		expect(error).toBeInstanceOf(BadRequest);
		expect(error.message).toBe("Invalid body");
		expect(error.issues).toEqual([
			{ path: "user.age", message: expect.stringContaining("number") },
		]);
	});
});
