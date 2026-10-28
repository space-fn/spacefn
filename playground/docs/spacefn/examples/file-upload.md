# File upload to R2

```ts
import { defineHandler } from "spacefn/handler";
import { readUploads, putUpload } from "spacefn/http";

export const POST = defineHandler(async (c) => {
	const { files } = await readUploads(c, {
		maxFileSize: 5 * 1024 * 1024,
		allowedTypes: ["image/png", "image/jpeg"],
	});
	const file = (files.file ?? files.image) as {
		size: number;
		arrayBuffer: () => Promise<ArrayBuffer>;
	};
	const bucket = c.env.UPLOADS as
		| { put: (k: string, v: ArrayBuffer, o?: unknown) => Promise<unknown> }
		| undefined;
	if (!bucket) throw new Error("UPLOADS binding missing");
	const key = await putUpload(bucket, file as never);
	return { key, size: file.size };
});
```

See [pages](../directory-structure/pages.md).
