import { Schema } from "effect";

/**
 * Errors a handler can fail with to answer with a specific HTTP status.
 * They are schema-backed, so they survive serialization (Durable Object RPC,
 * queues) and can be matched with `Effect.catchTag`.
 */
export class BadRequest extends Schema.TaggedError<BadRequest>()("BadRequest", {
	message: Schema.String,
	issues: Schema.optional(
		Schema.Array(Schema.Struct({ path: Schema.String, message: Schema.String })),
	),
}) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
	message: Schema.optional(Schema.String),
}) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
	message: Schema.optional(Schema.String),
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
	message: Schema.optional(Schema.String),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", {
	message: Schema.String,
}) {}

export class PayloadTooLarge extends Schema.TaggedError<PayloadTooLarge>()("PayloadTooLarge", {
	limitBytes: Schema.Number,
}) {}

export class UnsupportedMediaType extends Schema.TaggedError<UnsupportedMediaType>()(
	"UnsupportedMediaType",
	{ message: Schema.String },
) {}

export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()("TooManyRequests", {
	retryAfterSeconds: Schema.optional(Schema.Number),
}) {}

export type HttpError =
	| BadRequest
	| Unauthorized
	| Forbidden
	| NotFound
	| Conflict
	| PayloadTooLarge
	| UnsupportedMediaType
	| TooManyRequests;

const STATUS: Record<HttpError["_tag"], number> = {
	BadRequest: 400,
	Unauthorized: 401,
	Forbidden: 403,
	NotFound: 404,
	Conflict: 409,
	PayloadTooLarge: 413,
	UnsupportedMediaType: 415,
	TooManyRequests: 429,
};

export const isHttpError = (error: unknown): error is HttpError =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	Object.hasOwn(STATUS, (error as { _tag: string })._tag);

/** The HTTP status for an error: its own for an {@link HttpError}, 500 for anything else. */
export const httpStatus = (error: unknown): number =>
	isHttpError(error) ? STATUS[error._tag] : 500;

/**
 * A problem in the app's own files (config, conventions, env) that the author
 * can fix. `code` is stable, so tools can match on it.
 */
export class SpaceError extends Schema.TaggedError<SpaceError>()("SpaceError", {
	code: Schema.String,
	message: Schema.String,
	hint: Schema.optional(Schema.String),
	file: Schema.optional(Schema.String),
}) {}

/** One line for terminal output: `[CODE] file: message` plus the hint. */
export const formatSpaceError = (error: SpaceError): string => {
	const head = error.file
		? `[${error.code}] ${error.file}: ${error.message}`
		: `[${error.code}] ${error.message}`;
	return error.hint ? `${head}\n  hint: ${error.hint}` : head;
};
