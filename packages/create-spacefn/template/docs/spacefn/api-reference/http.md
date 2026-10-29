# HTTP helpers (`spacefn/http`)

## Example

```ts
import { defineHandler } from "spacefn/handler";
import { putUpload, readUploads } from "spacefn/http";

export const POST = defineHandler(async (c) => {
	const { fields, files } = await readUploads(c, {
		maxFileSize: 5 * 1024 * 1024,
		allowedTypes: ["image/png", "image/jpeg"],
	});
	const image = files.image;
	const file = Array.isArray(image) ? image[0] : image;
	if (!file) return c.json({ error: "image_required" }, 400);
	const key = await putUpload(c.env.UPLOADS, file, { prefix: "avatars" });
	return c.json({ key, caption: fields.caption ?? "" }, 201);
});
```

Declare the `UPLOADS` R2 binding in `cloudflare.config.ts`. A client-provided
filename is metadata only; `putUpload` creates a random object key.

## `readUploads(c, options?)`

Parses a multipart body and returns `{ fields, files }`.

- `maxFileSize` (default 10 MiB): per-file cap.
- `maxFiles` (default 10).
- `maxBodySize` (default `maxFileSize * maxFiles + 1 MiB`): whole-body cap, enforced while reading. Applies to chunked requests too.
- `allowedTypes`: list of MIME types, matched against the **detected** type (magic bytes), not the client's `Content-Type`.

Throws `SpaceError` with status 413 (too large), 415 (bad type), 400 (parse/read error), 400 (too many files).

Note: Workers buffer the parsed form in memory. The cap prevents unbounded use; it is not a true stream.

`ReadUploadsOptions` contains `maxFileSize`, `maxFiles`, `maxBodySize`, and
`allowedTypes`. The result is `UploadResult`: string `fields` plus `files`,
whose values are `UploadedFile` or arrays of uploaded files. An uploaded file
exposes `name`, detected or declared `type`, `size`, `arrayBuffer()`, and
`stream()`.

## `putUpload(bucket, file, options?)`

Streams the file to R2 under a generated key. Returns the key. The client's filename is never used as the key.

- `prefix` (default `"uploads"`).
- `contentType` (default: detected type).

The helper returns the generated object key. It accepts an R2-like bucket with
`put(key, value, options?)`; `putUpload` streams the file body and sets the
object's HTTP content type.
