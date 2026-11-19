import { currentSpan } from "./span";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface LogRecord extends LogFields {
	level: LogLevel;
	message: string;
	time: string;
	traceId?: string;
	spanId?: string;
}

export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
	/** A logger that adds `fields` to every record. */
	child(fields: LogFields): Logger;
}

export type LogSink = (record: LogRecord) => void;

let sink: LogSink = (record) => {
	const line = JSON.stringify(record);
	if (record.level === "error") console.error(line);
	else if (record.level === "warn") console.warn(line);
	else console.log(line);
};

/** Replaces where log records go. Tests use this to capture output. */
export function setLogSink(next: LogSink): void {
	sink = next;
}

function emit(level: LogLevel, base: LogFields, message: string, fields: LogFields = {}): void {
	const span = currentSpan();
	sink({
		...base,
		...fields,
		level,
		message,
		time: new Date().toISOString(),
		...(span ? { traceId: span.traceId, spanId: span.spanId } : {}),
	});
}

/** Creates a logger whose records carry the ids of the span they are written in. */
export function createLogger(base: LogFields = {}): Logger {
	return {
		debug: (message, fields) => emit("debug", base, message, fields),
		info: (message, fields) => emit("info", base, message, fields),
		warn: (message, fields) => emit("warn", base, message, fields),
		error: (message, fields) => emit("error", base, message, fields),
		child: (fields) => createLogger({ ...base, ...fields }),
	};
}
