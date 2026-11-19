/**
 * When to use SpaceError vs a plain Error:
 *
 * - Use SpaceError for errors a user can act on: bad config, bad convention file,
 *   failed validation of user input, missing binding, oversize upload. Give it a
 *   stable code, a hint, and (for HTTP-facing code) a status.
 * - Use a plain Error for internal/programmer errors and low-level validators
 *   (password rules, slug rules, totp parsing, sql splitting, trace config) where
 *   the caller already knows the context and a code adds no value.
 */
/** A structured error with a stable code, a human hint, and an optional file location. */
export class SpaceError extends Error {
	readonly code: string;
	readonly hint?: string;
	readonly file?: string;
	readonly line?: number;
	readonly status?: number;

	constructor(
		code: string,
		message: string,
		options?: { hint?: string; file?: string; line?: number; status?: number; cause?: unknown },
	) {
		super(message, options?.cause ? { cause: options.cause } : undefined);
		this.name = "SpaceError";
		this.code = code;
		this.hint = options?.hint;
		this.file = options?.file;
		this.line = options?.line;
		this.status = options?.status;
	}

	toString(): string {
		const loc = this.file ? `${this.file}${this.line ? `:${this.line}` : ""}` : "";
		const head = loc ? `[${this.code}] ${loc}: ${this.message}` : `[${this.code}] ${this.message}`;
		return this.hint ? `${head}\n  hint: ${this.hint}` : head;
	}
}

/** Format any thrown value for CLI output. */
export function formatError(error: unknown): string {
	if (error instanceof SpaceError) return error.toString();
	if (error instanceof Error) return error.message;
	return String(error);
}
