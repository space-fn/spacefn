import { Cause, Effect, Option, Schema, SchemaIssue } from "effect";
import { HttpServerError, HttpServerResponse } from "effect/http";

import { BadRequest, httpStatus, isHttpError, NotFound, type HttpError } from "../errors.ts";
import { Html } from "../html.ts";

/** An HTML response. */
export const htmlResponse = (
	markup: Html,
	options?: { readonly status?: number },
): HttpServerResponse.HttpServerResponse =>
	HttpServerResponse.text(markup.value, {
		contentType: "text/html; charset=utf-8",
		...(options?.status ? { status: options.status } : {}),
	});

const issuesOf = SchemaIssue.makeFormatterStandardSchemaV1();

/** A decode failure as a 400 that lists each issue by path, e.g. `email: Expected a string`. */
export const badRequestFrom = (what: string, error: Schema.SchemaError): BadRequest =>
	new BadRequest({
		message: `Invalid ${what}`,
		issues: issuesOf(error.issue).issues.map((issue) => ({
			path: (issue.path ?? []).map(String).join("."),
			message: issue.message,
		})),
	});

/**
 * Turns a handler's value into a response: a response passes through, `html`
 * is HTML, a string is text, `undefined` is 204 No Content, anything else is JSON.
 */
export const toResponse = (
	value: unknown,
): Effect.Effect<HttpServerResponse.HttpServerResponse> => {
	if (HttpServerResponse.isHttpServerResponse(value)) return Effect.succeed(value);
	if (value instanceof Html) return Effect.succeed(htmlResponse(value));
	if (typeof value === "string") return Effect.succeed(HttpServerResponse.text(value));
	if (value === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 204 }));
	return Effect.orDie(HttpServerResponse.json(value));
};

const body = (error: HttpError): Record<string, unknown> => {
	switch (error._tag) {
		case "BadRequest":
			return { message: error.message, ...(error.issues ? { issues: error.issues } : {}) };
		case "PayloadTooLarge":
			return {
				message: `Body is larger than ${error.limitBytes} bytes`,
				limitBytes: error.limitBytes,
			};
		case "TooManyRequests":
			return { message: "Too many requests" };
		default:
			return error.message ? { message: error.message } : {};
	}
};

/** The JSON response for a tagged HTTP error: `{ error: "NotFound", message? }` with its status. */
export const errorResponse = (error: HttpError): HttpServerResponse.HttpServerResponse => {
	const response = HttpServerResponse.jsonUnsafe(
		{ error: error._tag, ...body(error) },
		{ status: httpStatus(error) },
	);
	return error._tag === "TooManyRequests" && error.retryAfterSeconds !== undefined
		? HttpServerResponse.setHeader(response, "retry-after", String(error.retryAfterSeconds))
		: response;
};

const INTERNAL = HttpServerResponse.jsonUnsafe(
	{ error: "InternalError", message: "Something went wrong" },
	{ status: 500 },
);

/** The router's own failures, as the matching tagged HTTP error. */
const fromServerError = (error: unknown): HttpError | undefined => {
	if (!HttpServerError.isHttpServerError(error)) return undefined;
	const { reason } = error;
	if (reason._tag === "RouteNotFound")
		return new NotFound({ message: `No route for ${reason.request.method} ${reason.request.url}` });
	if (reason._tag === "RequestParseError")
		return new BadRequest({ message: "Could not parse the request" });
	return undefined;
};

/**
 * Answers every failure of a handler. Tagged HTTP errors get their status;
 * anything else is logged with its full cause and answered with an opaque 500,
 * so internals never reach the client. Interruption is passed on untouched.
 */
export const handleErrors = <R>(
	effect: Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
	Effect.catchCause(effect, (cause) => {
		if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause as Cause.Cause<never>);
		const found = Cause.findErrorOption(cause);
		const error = Option.isSome(found)
			? isHttpError(found.value)
				? found.value
				: fromServerError(found.value)
			: undefined;
		if (error) return Effect.succeed(errorResponse(error));
		return Effect.as(Effect.logError("Unhandled error in a request", cause), INTERNAL);
	});
