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
