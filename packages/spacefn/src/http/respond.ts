import { Cause, Context, Effect, Option, Schema, SchemaIssue } from "effect";
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/http";

import { BadRequest, httpStatus, isHttpError, NotFound, type HttpError } from "../errors.ts";
import { escapeHtml, Html } from "../html.ts";

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

/** A redirect. The default 303 makes the browser GET `to`, which is right after a form post. */
export const redirect = (
	to: string,
	status: 301 | 302 | 303 | 307 | 308 = 303,
): HttpServerResponse.HttpServerResponse => HttpServerResponse.redirect(to, { status });

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

const TITLES: Readonly<Record<number, string>> = {
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	409: "Conflict",
	413: "Payload Too Large",
	415: "Unsupported Media Type",
	422: "Unprocessable Content",
	429: "Too Many Requests",
	500: "Internal Server Error",
};

/**
 * Whether the request is a browser navigating to a page: it asks for HTML
 * first and isn't a Datastar request. Those get an HTML error page;
 * `fetch`, Datastar and API clients keep the JSON.
 */
export const wantsHtml = (request: HttpServerRequest.HttpServerRequest): boolean =>
	request.headers["datastar-request"] !== "true" &&
	(request.headers.accept ?? "").split(",")[0]!.trim().startsWith("text/html");

/** A plain error page with the status, its name and the error's message, if it has one. */
export const errorPageResponse = (
	status: number,
	message: string | undefined,
): HttpServerResponse.HttpServerResponse => {
	const title = `${status} ${TITLES[status] ?? "Error"}`;
	return htmlResponse(
		new Html(
			`<!doctype html><html lang="en"><head><meta charset="utf-8">` +
				`<meta name="viewport" content="width=device-width, initial-scale=1">` +
				`<title>${title}</title></head><body><main><h1>${title}</h1>` +
				(message ? `<p>${escapeHtml(message)}</p>` : "") +
				`</main></body></html>`,
		),
		{ status },
	);
};

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
 * What a failed request answers with, given the full cause: the entry's
 * `onError`. It may read the request (`HttpServerRequest`), and must not fail.
 */
export type ErrorHandler = (
	cause: Cause.Cause<unknown>,
) => Effect.Effect<HttpServerResponse.HttpServerResponse>;

/**
 * spacefn's error handler, the default `onError`. Tagged HTTP errors get their
 * status; anything else is logged with its full cause and answered with an
 * opaque 500, so internals never reach the client. Browser navigations get a
 * plain HTML page, everything else JSON.
 */
export const errorPage: ErrorHandler = (cause) => {
	const found = Cause.findErrorOption(cause);
	const error = Option.isSome(found)
		? isHttpError(found.value)
			? found.value
			: fromServerError(found.value)
		: undefined;
	return Effect.gen(function* () {
		const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
		const html = Option.isSome(request) && wantsHtml(request.value);
		if (error) {
			if (!html) return errorResponse(error);
			const page = errorPageResponse(
				httpStatus(error),
				"message" in error ? (error.message as string | undefined) : undefined,
			);
			return error._tag === "TooManyRequests" && error.retryAfterSeconds !== undefined
				? HttpServerResponse.setHeader(page, "retry-after", String(error.retryAfterSeconds))
				: page;
		}
		yield* Effect.logError("Unhandled error in a request", cause);
		return html ? errorPageResponse(500, undefined) : INTERNAL;
	});
};

/** The app's `onError`, {@link errorPage} unless the entry gives another. */
export const OnError = Context.Reference<ErrorHandler>("spacefn/OnError", {
	defaultValue: () => errorPage,
});

/**
 * Answers every failure of a handler with the app's {@link OnError}. The
 * router's failures arrive as `NotFound` and `BadRequest`; interruption is
 * passed on untouched.
 */
export const handleErrors = <R>(
	effect: Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
	Effect.catchCause(effect, (cause) => {
		if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause as Cause.Cause<never>);
		// The router's own failures (no route, an unreadable body) reach onError as spacefn's errors.
		const found = Cause.findErrorOption(cause);
		const known = Option.isSome(found) ? fromServerError(found.value) : undefined;
		return Effect.gen(function* () {
			const handle = yield* OnError;
			return yield* handle(known ? Cause.fail(known) : cause);
		});
	});
