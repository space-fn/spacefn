import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Clock, type Config, Effect, Layer, Option } from "effect";
import { Blob, BlobError, type BlobObject } from "spacefn";

import { dataDir } from "./db.ts";

const DATA = ".blob";
const META = ".json";

interface Meta {
	readonly contentType?: string | undefined;
	readonly uploadedAt: number;
}

const isMissing = (error: unknown) => (error as { code?: unknown })?.code === "ENOENT";

/**
 * Blob in a directory, `<SPACE_DATA_DIR>/blob` unless `dir` is given.
 * Each object is a file named by its escaped key, so keys can't reach outside
 * the directory, plus a small JSON file with its content type. Writes are
 * atomic, so a reader never sees half an upload.
 */
export const blobLayer = (dir?: string): Layer.Layer<Blob, Config.ConfigError> =>
	Layer.effect(
		Blob,
		Effect.gen(function* () {
			const root = dir ?? `${yield* dataDir}/blob`;
			const path = (key: string, suffix: string) => join(root, encodeURIComponent(key) + suffix);
			const attempt = <A>(operation: BlobError["operation"], key: string, run: () => Promise<A>) =>
				Effect.tryPromise({ try: run, catch: (cause) => new BlobError({ operation, key, cause }) });
			const writeAtomic = async (file: string, data: Uint8Array | string) => {
				const temp = `${file}.${crypto.randomUUID()}.tmp`;
				await writeFile(temp, data);
				await rename(temp, file);
			};
			return {
				put: (key, body, options) =>
					Effect.gen(function* () {
						const now = yield* Clock.currentTimeMillis;
						const meta: Meta = { contentType: options?.contentType, uploadedAt: now };
						yield* attempt("put", key, async () => {
							await mkdir(root, { recursive: true });
							await writeAtomic(path(key, META), JSON.stringify(meta));
							await writeAtomic(path(key, DATA), body);
						});
					}),
				get: (key) =>
					attempt("get", key, async (): Promise<Option.Option<BlobObject>> => {
						try {
							const [bytes, meta] = await Promise.all([
								readFile(path(key, DATA)),
								readFile(path(key, META), "utf8").then((text) => JSON.parse(text) as Meta),
							]);
							const body = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
							return Option.some({
								key,
								body,
								size: body.byteLength,
								contentType: meta.contentType,
								uploadedAt: new Date(meta.uploadedAt),
							});
						} catch (error) {
							if (isMissing(error)) return Option.none();
							throw error;
						}
					}),
				delete: (key) =>
					attempt("delete", key, async () => {
						await rm(path(key, DATA), { force: true });
						await rm(path(key, META), { force: true });
					}),
				list: (options) =>
					attempt("list", options?.prefix ?? "", async () => {
						const files = await readdir(root).catch((error) => {
							if (isMissing(error)) return [];
							throw error;
						});
						const keys = files
							.filter((file) => file.endsWith(DATA))
							.map((file) => decodeURIComponent(file.slice(0, -DATA.length)))
							.filter((key) => key.startsWith(options?.prefix ?? ""))
							.sort();
						return options?.limit === undefined ? keys : keys.slice(0, options.limit);
					}),
			};
		}),
	);
