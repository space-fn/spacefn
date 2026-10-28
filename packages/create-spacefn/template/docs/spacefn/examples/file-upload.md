# File upload to R2

```ts
import { Hono } from "hono";
import { readUploads, putUpload } from "spacefn/http";

const app = new Hono();

app.post("/upload", async (c) => {
	const { files } = await readUploads(c, {
		maxFileSize: 5 * 1024 * 1024,
		allowedTypes: ["image/png", "image/jpeg"],
	});
	const file = files.file as {
		name: string;
		size: number;
		arrayBuffer: () => Promise<ArrayBuffer>;
	};
	const bucket = c.env.UPLOADS as {
		put: (k: string, v: ArrayBuffer, o?: unknown) => Promise<unknown>;
	};
	const key = await putUpload(bucket, file as never);
	return c.json({ key, size: file.size });
});
```

See [http](../api-reference/html.md) and [pages](../directory-structure/pages.md).
