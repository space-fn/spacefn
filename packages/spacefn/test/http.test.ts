import { Hono } from "hono";
import { describe, expect, test } from "vite-plus/test";

import { onError } from "../src/handler";
import { readUploads } from "../src/http";

describe("readUploads", () => {
	async function run(form: FormData, opts?: Parameters<typeof readUploads>[1]) {
		const app = new Hono();
		app.onError(onError);
		app.post("/upload", async (c) => {
			const r = await readUploads(c, opts);
			return c.json(r);
		});
		const res = await app.request("/upload", { method: "POST", body: form });
		return res;
	}

	test("reads fields and files", async () => {
		const form = new FormData();
		form.append("name", "alice");
		form.append("file", new File(["hello"], "a.png", { type: "image/png" }));
		const res = await run(form);
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			fields: { name: string };
			files: { file: { size: number; type: string } };
		};
		expect(json.fields.name).toBe("alice");
		expect(json.files.file.size).toBe(5);
		expect(json.files.file.type).toBe("image/png");
	});

	test("rejects spoofed content type", async () => {
		const form = new FormData();
		form.append("file", new File([new Uint8Array([0x4d, 0x5a])], "x.png", { type: "image/png" }));
		const res = await run(form, { allowedTypes: ["image/png"] });
		expect(res.status).toBe(415);
	});

	test("rejects too many files", async () => {
		const form = new FormData();
		form.append("file", new File(["a"], "a.png", { type: "image/png" }));
		form.append("file", new File(["b"], "b.png", { type: "image/png" }));
		const res = await run(form, { maxFiles: 1 });
		expect(res.status).toBe(400);
	});

	test("rejects oversized file", async () => {
		const form = new FormData();
		form.append("file", new File(["x".repeat(100)], "a.png", { type: "image/png" }));
		const res = await run(form, { maxFileSize: 10 });
		expect(res.status).toBe(413);
	});

	test("handles empty body", async () => {
		const form = new FormData();
		const res = await run(form);
		expect(res.status).toBe(200);
	});
});

import { putUpload } from "../src/http";

describe("putUpload", () => {
	test("streams the file without buffering", async () => {
		let received: unknown;
		const bucket = {
			put: async (key: string, value: unknown) => {
				received = value;
				return {};
			},
		};
		const file = {
			name: "photo.png",
			type: "image/png",
			size: 4,
			arrayBuffer: async () => {
				throw new Error("should not buffer");
			},
			stream: () => new ReadableStream(),
		};
		const key = await putUpload(bucket, file as never);
		expect(key).toMatch(/^uploads\/[0-9a-f-]+\.png$/);
		expect(received).toBeInstanceOf(ReadableStream);
	});

	test("unknown type yields no extension", async () => {
		let key = "";
		const bucket = {
			put: async (k: string) => {
				key = k;
				return {};
			},
		};
		const file = {
			name: "data.bin",
			type: "application/octet-stream",
			size: 4,
			arrayBuffer: async () => new ArrayBuffer(4),
			stream: () => new ReadableStream(),
		};
		await putUpload(bucket, file as never);
		expect(key).toMatch(/^uploads\/[0-9a-f-]+$/);
	});
});
