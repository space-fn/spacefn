<!-- source: playground/app/routes/upload.ts -->

# File upload to R2

```ts
import { defineHandler } from "spacefn/handler";
import { readUploads, putUpload, type UploadedFile } from "spacefn/http";

type Bucket = {
	put: (key: string, value: ReadableStream<any>, opts?: unknown) => Promise<unknown>;
};

export const POST = defineHandler(async (c) => {
	const { files } = await readUploads(c, {
		maxFileSize: 5 * 1024 * 1024,
		allowedTypes: ["image/png", "image/jpeg"],
	});
	const file = (files.file ?? files.image) as UploadedFile;
	const bucket = (c.env as unknown as { UPLOADS?: Bucket }).UPLOADS;
	if (!bucket) throw new Error("UPLOADS binding missing");
	const key = await putUpload(bucket as never, file);
	return { key, size: file.size };
});
```

See [pages](../directory-structure/pages.md).
