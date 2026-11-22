import { Effect, Schema } from "effect";
import type { HttpServerRequest } from "effect/http";

import { BadRequest, PayloadTooLarge, UnsupportedMediaType } from "../errors.ts";
import { entriesToRecord, MiB, readWith, type BodyError, type BodyLimits } from "./body.ts";

export interface UploadLimits extends BodyLimits {
	/** Most files in one request. Default 10. */
	readonly maxFiles?: number;
	/** Largest single file, in bytes. Default 10 MiB. */
	readonly maxFileBytes?: number;
	/**
	 * Accepted file types, checked against the file's first bytes, not the
	 * client's claim. Known: image/png, image/jpeg, image/gif, image/webp,
	 * application/pdf, application/zip. Default: any type.
	 */
	readonly types?: readonly string[];
}

/** A file field in a multipart body. Use it in the body schema: `Schema.Struct({ avatar: Upload })`. */
export const Upload = Schema.instanceOf(File, { identifier: "Upload" });

const SIGNATURES: readonly { type: string; bytes: readonly number[]; at?: number }[] = [
	{ type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
	{ type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
	{ type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
	{ type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
	{ type: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

/** The type a file's first bytes prove, or `undefined` when they match no known signature. */
export const sniffType = (head: Uint8Array): string | undefined => {
	const found = SIGNATURES.find((sig) => sig.bytes.every((byte, i) => head[i] === byte));
	if (found) return found.type;
	const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
	if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	return undefined;
};

type Field = string | File;

const checkFile = (file: File, limits: Required<Omit<UploadLimits, "types">> & UploadLimits) =>
	Effect.gen(function* () {
		if (file.size > limits.maxFileBytes)
			return yield* new PayloadTooLarge({ limitBytes: limits.maxFileBytes });
		const head = new Uint8Array(yield* Effect.promise(() => file.slice(0, 16).arrayBuffer()));
		const sniffed = sniffType(head);
		if (limits.types && (sniffed === undefined || !limits.types.includes(sniffed)))
			return yield* new UnsupportedMediaType({
				message: `"${file.name}" is ${sniffed ?? "of an unknown type"}; accepted: ${limits.types.join(", ")}`,
			});
		// Trust the bytes over the client's claim when they prove a type.
		return sniffed && sniffed !== file.type ? new File([file], file.name, { type: sniffed }) : file;
	});

/**
 * Reads a multipart body. Text fields are strings and file fields are `File`s
 * (the same value on Bun and Workers); repeated keys become arrays. Every limit
 * is checked before the handler runs.
 */
export const readMultipart = (
	limits: UploadLimits = {},
): Effect.Effect<Record<string, Field | Field[]>, BodyError, HttpServerRequest.HttpServerRequest> =>
	Effect.gen(function* () {
		const maxFiles = limits.maxFiles ?? 10;
		const maxFileBytes = limits.maxFileBytes ?? 10 * MiB;
		const resolved = {
			...limits,
			maxFiles,
			maxFileBytes,
			maxBytes: limits.maxBytes ?? maxFiles * maxFileBytes + MiB,
		};
		const form = yield* readWith(resolved.maxBytes, (request) => request.formData(), "multipart");

		const entries: [string, Field][] = [];
		let files = 0;
		for (const [key, value] of form.entries()) {
			if (typeof value === "string") {
				entries.push([key, value]);
				continue;
			}
			if (++files > maxFiles)
				return yield* new BadRequest({ message: `Too many files (at most ${maxFiles})` });
			entries.push([key, yield* checkFile(value, resolved)]);
		}
		return entriesToRecord(entries);
	});
