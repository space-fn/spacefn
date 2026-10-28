import type { Context } from "hono";

import { SpaceError } from "./errors";

export interface UploadedFile {
	name: string;
	type: string;
	size: number;
	arrayBuffer(): Promise<ArrayBuffer>;
	stream(): ReadableStream<Uint8Array>;
}

export interface UploadResult {
	fields: Record<string, string>;
	files: Record<string, UploadedFile | UploadedFile[]>;
}

export interface ReadUploadsOptions {
	/** Maximum size per file in bytes. Default 10 MiB. */
	maxFileSize?: number;
	/** Maximum number of files. Default 10. */
	maxFiles?: number;
	/** Allowed MIME types (matched against the declared type). */
	allowedTypes?: string[];
}

const DEFAULT_MAX_FILE = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 10;

/** Read and validate a multipart body. Throws SpaceError on violation. */
export async function readUploads(
	c: Context,
	options: ReadUploadsOptions = {},
): Promise<UploadResult> {
	const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE;
	const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
	const allowed = options.allowedTypes;

	let body: Record<string, unknown>;
	try {
		body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
	} catch (error) {
		throw new SpaceError("UPLOAD_PARSE", "Failed to parse multipart body", {
			hint: "Ensure Content-Type is multipart/form-data.",
			cause: error,
		});
	}

	const fields: Record<string, string> = {};
	const files: Record<string, UploadedFile | UploadedFile[]> = {};
	let fileCount = 0;

	for (const [key, value] of Object.entries(body)) {
		if (value instanceof File) {
			fileCount++;
			if (fileCount > maxFiles) {
				throw new SpaceError("UPLOAD_TOO_MANY", `Too many files (max ${maxFiles})`, {
					hint: "Reduce the number of uploaded files.",
				});
			}
			if (value.size > maxFileSize) {
				throw new SpaceError(
					"UPLOAD_TOO_LARGE",
					`File "${value.name}" exceeds ${maxFileSize} bytes`,
					{
						hint: "Reduce file size or raise maxFileSize.",
					},
				);
			}
			if (allowed && !allowed.includes(value.type)) {
				throw new SpaceError(
					"UPLOAD_BAD_TYPE",
					`File "${value.name}" has disallowed type ${value.type}`,
					{
						hint: `Allowed: ${allowed.join(", ")}`,
					},
				);
			}
			const wrapped: UploadedFile = {
				name: value.name,
				type: value.type,
				size: value.size,
				arrayBuffer: () => value.arrayBuffer(),
				stream: () => value.stream() as ReadableStream<Uint8Array>,
			};
			const existing = files[key];
			if (existing) {
				const arr = Array.isArray(existing) ? existing : [existing];
				arr.push(wrapped);
				files[key] = arr;
			} else {
				files[key] = wrapped;
			}
		} else if (typeof value === "string") {
			fields[key] = value;
		} else if (Array.isArray(value)) {
			for (const v of value) {
				if (v instanceof File) {
					fileCount++;
					if (fileCount > maxFiles) {
						throw new SpaceError("UPLOAD_TOO_MANY", `Too many files (max ${maxFiles})`);
					}
					if (v.size > maxFileSize) {
						throw new SpaceError(
							"UPLOAD_TOO_LARGE",
							`File "${v.name}" exceeds ${maxFileSize} bytes`,
						);
					}
					if (allowed && !allowed.includes(v.type)) {
						throw new SpaceError(
							"UPLOAD_BAD_TYPE",
							`File "${v.name}" has disallowed type ${v.type}`,
						);
					}
					const wrapped: UploadedFile = {
						name: v.name,
						type: v.type,
						size: v.size,
						arrayBuffer: () => v.arrayBuffer(),
						stream: () => v.stream() as ReadableStream<Uint8Array>,
					};
					const existing = files[key];
					if (existing) {
						const arr = Array.isArray(existing) ? existing : [existing];
						arr.push(wrapped);
						files[key] = arr;
					} else {
						files[key] = wrapped;
					}
				} else if (typeof v === "string") {
					fields[key] = v;
				}
			}
		}
	}

	return { fields, files };
}

/** Stream an uploaded file into an R2 bucket under a safe key. Returns the key. */
export async function putUpload(
	bucket: {
		put: (
			key: string,
			value: ReadableStream | ArrayBuffer | Blob,
			opts?: unknown,
		) => Promise<unknown>;
	},
	file: UploadedFile,
	options: { prefix?: string; contentType?: string } = {},
): Promise<string> {
	const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
	const key = `${options.prefix ?? "uploads"}/${crypto.randomUUID()}${ext}`;
	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: options.contentType ?? file.type },
	});
	return key;
}
