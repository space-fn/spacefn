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
formats rather than trusting the browser MIME type. The limits are a rule, so a
module owns them, along with recording who owns each object:

```ts
// modules/images/index.ts

import { addImage } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import type { DbReader } from "spacefn/db";

export const imageUploads = {
	maxFileSize: 5 * 1024 * 1024,
	maxFiles: 1,
	allowedTypes: ["image/png", "image/jpeg"],
};

export async function saveImage(
	db: DbReader,
	owner: { id: number } | undefined,
	image: { key: string; contentType: string },
) {
	if (!owner) throw new AppError("unauthorized", "Sign in first.");
	await addImage(db, { ownerId: owner.id, key: image.key, contentType: image.contentType });
	return { id: image.key };
}
```

The route parses the upload, writes it to R2 with a generated key, and hands
the key to the module:

```ts
// app/routes/images.ts

import { mainDb } from "@app/db/main_db";
import { imageUploads, saveImage } from "@modules/images";
import { AppError } from "@utils/errors";
import { defineHandler } from "spacefn/handler";
import { putUpload, readUploads } from "spacefn/http";

export const POST = defineHandler(async (c) => {
	const user = c.get("user") as { id: number } | undefined;
	if (!user) throw new AppError("unauthorized", "Sign in first.");
	const { files } = await readUploads(c, imageUploads);
	const file = files.image;
	if (!file || Array.isArray(file)) throw new AppError("invalid", "Choose one image.");
	const key = await putUpload(c.env.UPLOADS as never, file, { prefix: "images" });
	return c.json(
		await saveImage(await mainDb(c.env.DB), user, { key, contentType: file.type }),
		201,
	);
});
```

The route checks the session before reading the body, so an anonymous caller
cannot make the Worker parse or store a file. `putUpload` returns a generated
object key with a random identifier; the module stores it with the owner and
detected media type. See the complete [upload example](../examples/file-upload.md)
for the multipart form.

## Serve only after authorization

On download, a module looks the record up through a query scoped to the
current user or tenant, and the route fetches the object by its stored key:

```ts
const user = c.get("user") as { id: number } | undefined;
const key = await imageKeyFor(await mainDb(c.env.DB), user, c.req.param("id"));

const object = await c.env.UPLOADS.get(key);
if (!object) return c.notFound();
const headers = new Headers();
object.writeHttpMetadata(headers);
headers.set("x-content-type-options", "nosniff");
return new Response(object.body, { headers });
```

`imageKeyFor` is shown in the [upload example](../examples/file-upload.md#serve-an-authorized-object).

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
