/**
 * A problem in a migration or query file that the author can fix.
 * `code` is stable, so tools (CLI, VS Code diagnostics) can match on it.
 */
export class SqlError extends Error {
	override readonly name = "SqlError";
	readonly code: string;
	readonly hint?: string;
	readonly file?: string;

	constructor(
		code: string,
		message: string,
		options?: { hint?: string; file?: string; cause?: unknown },
	) {
		super(message, options?.cause === undefined ? undefined : { cause: options.cause });
		this.code = code;
		this.hint = options?.hint;
		this.file = options?.file;
	}
}
