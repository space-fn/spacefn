# HTTP helpers (`spacefn/http`)

## `readUploads(c, options?)`

Parses a multipart body and returns `{ fields, files }`.

- `maxFileSize` (default 10 MiB): per-file cap.
- `maxFiles` (default 10).
- `maxBodySize` (default `maxFileSize * maxFiles + 1 MiB`): whole-body cap, enforced while reading. Applies to chunked requests too.
- `allowedTypes`: list of MIME types, matched against the **detected** type (magic bytes), not the client's `Content-Type`.

Throws `SpaceError` with status 413 (too large), 415 (bad type), 400 (parse/read error), 400 (too many files).

Note: Workers buffer the parsed form in memory. The cap prevents unbounded use; it is not a true stream.

## `putUpload(bucket, file, options?)`

Streams the file to R2 under a generated key. Returns the key. The client's filename is never used as the key.

- `prefix` (default `"uploads"`).
- `contentType` (default: detected type).
