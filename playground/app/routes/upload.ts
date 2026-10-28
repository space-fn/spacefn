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
	const bucket = (
		c.env as { UPLOADS?: { put: (k: string, v: ArrayBuffer, o?: unknown) => Promise<unknown> } }
	).UPLOADS;
	if (!bucket) throw new Error("UPLOADS binding missing");
	const key = await putUpload(bucket as never, file as never);
	return { key, size: file.size };
});
