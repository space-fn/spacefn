# File storage with R2

Use R2 for user uploads and other large objects; keep object keys and
ownership metadata in your database. The database record lets the app authorize
each download without exposing the bucket or trusting a browser-supplied key.

## Declare the bucket

Add a binding under `worker.env` in `cloudflare.config.ts`:

```ts
import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
		env: {
			UPLOADS: bindings.r2({ name: "my-app-uploads" }),
		},
	},
});
```

The binding type is generated for `c.env.UPLOADS`. Create the bucket in
Cloudflare and configure the production binding to point at it.

## Validate before storing

Use [`readUploads`](../api-reference/http.md) to limit request size, file
count, and supported content types. It detects signatures for supported
formats rather than trusting the browser MIME type. Then write the stream to
R2 with a generated key:

```ts
import { currentUser } from "@modules/auth";
// app/routes/images.ts
import { saveImageRecord } from "@modules/images";
import { defineHandler } from "spacefn/handler";
import { putUpload, readUploads } from "spacefn/http";

export const POST = defineHandler(async (c) => {
	const user = currentUser(c);
	const { files } = await readUploads(c, {
		maxFileSize: 5 * 1024 * 1024,
		maxFiles: 1,
		allowedTypes: ["image/png", "image/jpeg"],
	});
	const file = files.image;
	if (!file || Array.isArray(file)) return c.json({ error: "image_required" }, 400);
	const key = await putUpload(c.env.UPLOADS as never, file, { prefix: "images" });
	await saveImageRecord(c.env.DB, { ownerId: user.id, key, contentType: file.type });
	return c.json({ id: key }, 201);
});
```

The helper returns a generated object key with a random identifier. Store that
key alongside the owner, detected media type, and any application-level
metadata. See the complete [upload example](../examples/file-upload.md) for
the route and multipart form.

## Serve only after authorization

On download, load the record through a query scoped to the current user or
tenant, then fetch the object by its stored key:

```ts
const image = await findImageForUser(c.env.DB, { id, userId: user.id });
if (!image) return c.notFound();

const object = await c.env.UPLOADS.get(image.key);
if (!object) return c.notFound();
const headers = new Headers();
object.writeHttpMetadata(headers);
headers.set("x-content-type-options", "nosniff");
return new Response(object.body, { headers });
```

Do not treat an unguessable key as authorization. Avoid serving user-controlled
HTML or SVG from the app's origin; for public content, use a separate origin,
an explicit content policy, and conservative cache headers.

## Operational checklist

- Enforce upload and total request limits on the server.
- Validate type, size, and ownership before persisting metadata.
- Generate object keys; never concatenate a raw filename into a key.
- Decide retention, deletion, quotas, and cleanup for abandoned uploads.
- Keep buckets private unless public access is an explicit product decision.
- Store credentials and secrets only in Cloudflare's secret configuration.

See [R2 upload example](../examples/file-upload.md),
[Environment](../directory-structure/env.md), and
[Cloudflare setup](./cloudflare-v2.md).
