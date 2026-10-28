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
	maxFileSize?: number;
	maxFiles?: number;
	allowedTypes?: string[];
}

const DEFAULT_MAX_FILE = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 10;

// Magic-byte signatures for types we can verify independently of the client.
const SIGNATURES: { type: string; bytes: number[] }[] = [
	{ type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
	{ type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
	{ type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
	{ type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
	{ type: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

function detectType(buf: Uint8Array): string | null {
	for (const sig of SIGNATURES) {
		if (sig.bytes.every((b, i) => buf[i] === b)) return sig.type;
	}
	// webp: RIFF....WEBP
	if (
		buf.length >= 12 &&
		buf[0] === 0x52 &&
		buf[1] === 0x49 &&
		buf[2] === 0x46 &&
		buf[3] === 0x46 &&
		buf[8] === 0x57 &&
		buf[9] === 0x45 &&
		buf[10] === 0x42 &&
		buf[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

export async function readUploads(
	c: Context,
	options: ReadUploadsOptions = {},
): Promise<UploadResult> {
	const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE;
	const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
	const allowed = options.allowedTypes;

	const contentLength = Number(c.req.header("content-length") ?? "0");
	if (contentLength > 0 && contentLength > maxFileSize * maxFiles + 1024 * 1024) {
		throw new SpaceError("UPLOAD_TOO_LARGE", "Request body too large", {
			status: 413,
			hint: "Reduce payload size.",
		});
	}

	let body: Record<string, unknown>;
	try {
		body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
	} catch (error) {
		throw new SpaceError("UPLOAD_PARSE", "Failed to parse multipart body", {
			status: 400,
			hint: "Ensure Content-Type is multipart/form-data.",
			cause: error,
		});
	}

	const fields: Record<string, string> = {};
	const files: Record<string, UploadedFile | UploadedFile[]> = {};
	let fileCount = 0;

	const handleFile = async (key: string, file: File) => {
		fileCount++;
		if (fileCount > maxFiles) {
			throw new SpaceError("UPLOAD_TOO_MANY", `Too many files (max ${maxFiles})`, { status: 400 });
		}
		if (file.size > maxFileSize) {
			throw new SpaceError("UPLOAD_TOO_LARGE", `File "${file.name}" exceeds ${maxFileSize} bytes`, {
				status: 413,
			});
		}
		const buf = new Uint8Array(await file.arrayBuffer());
		const detected = detectType(buf);
		if (allowed && (detected === null || !allowed.includes(detected))) {
			throw new SpaceError(
				"UPLOAD_BAD_TYPE",
				`File "${file.name}" has disallowed type ${detected ?? "unknown"}`,
				{
					status: 415,
					hint: `Allowed: ${allowed.join(", ")}`,
				},
			);
		}
		const wrapped: UploadedFile = {
			name: file.name,
			type: detected ?? file.type,
			size: file.size,
			arrayBuffer: async () => buf.buffer as ArrayBuffer,
			stream: () => new Blob([buf]).stream(),
		};
		const existing = files[key];
		if (existing) {
			const arr = Array.isArray(existing) ? existing : [existing];
			arr.push(wrapped);
			files[key] = arr;
		} else {
			files[key] = wrapped;
		}
	};

	for (const [key, value] of Object.entries(body)) {
		if (value instanceof File) {
			await handleFile(key, value);
		} else if (Array.isArray(value)) {
			for (const v of value) {
				if (v instanceof File) await handleFile(key, v);
				else if (typeof v === "string") fields[key] = v;
			}
		} else if (typeof value === "string") {
			fields[key] = value;
		}
	}

	return { fields, files };
}

export async function putUpload(
	bucket: {
		put: (
			key: string,
			value: File | Blob | ArrayBuffer | ReadableStream,
			opts?: unknown,
		) => Promise<unknown>;
	},
	file: UploadedFile,
	options: { prefix?: string; contentType?: string } = {},
): Promise<string> {
	const ext =
		file.type === "image/png"
			? ".png"
			: file.type === "image/jpeg"
				? ".jpg"
				: file.type === "image/gif"
					? ".gif"
					: file.type === "image/webp"
						? ".webp"
						: file.type === "application/pdf"
							? ".pdf"
							: "";
	const key = `${options.prefix ?? "uploads"}/${crypto.randomUUID()}${ext}`;
	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: options.contentType ?? file.type },
	});
	return key;
}
