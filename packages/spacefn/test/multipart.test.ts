import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import { Input } from "../src/http/input.ts";
import { sniffType, Upload } from "../src/http/multipart.ts";
import { route, routesLayer } from "../src/http/route.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let dispose: (() => Promise<void>) | undefined;
afterEach(() => dispose?.());

const serve = (limits: Parameters<typeof Input.body>[1]) => {
	const Avatar = Schema.Struct({ name: Schema.String, avatar: Upload });
	const upload = route({
		POST: Effect.map(Input.body(Avatar, limits), ({ name, avatar }) => ({
			name,
			file: avatar.name,
			type: avatar.type,
			size: avatar.size,
		})),
	});
	const app = HttpRouter.toWebHandler(
		routesLayer([
			{
				path: "/avatar",
				params: [],
				file: "app/routes/avatar.ts",
				module: { default: upload },
			},
		]).pipe(Layer.provide(HttpServer.layerServices)),
		{ disableLogger: true },
	);
	dispose = app.dispose;
	return async (form: FormData) => {
		const response = await app.handler(
			new Request("http://app.test/avatar", { method: "POST", body: form }),
		);
		return { status: response.status, body: await response.json() };
	};
};

const formWith = (...files: File[]) => {
	const form = new FormData();
	form.set("name", "ada");
	for (const file of files) form.append("avatar", file);
	return form;
};

describe("multipart bodies", () => {
	it("decodes fields and files, trusting the bytes over the claimed type", async () => {
		const send = serve({ types: ["image/png"] });
		const result = await send(formWith(new File([PNG], "me.png", { type: "text/plain" })));
		expect(result).toEqual({
			status: 200,
			body: { name: "ada", file: "me.png", type: "image/png", size: 12 },
		});
	});

	it("refuses a file whose bytes are not an accepted type with 415", async () => {
		const send = serve({ types: ["image/png"] });
		const result = await send(formWith(new File(["<svg/>"], "me.png", { type: "image/png" })));
		expect(result.status).toBe(415);
	});

	it("enforces file size, file count and body size", async () => {
		expect((await serve({ maxFileBytes: 4 })(formWith(new File([PNG], "a.png")))).status).toBe(413);
		const two = formWith(new File([PNG], "a.png"), new File([PNG], "b.png"));
		expect((await serve({ maxFiles: 1 })(two)).status).toBe(400);
		expect(
			(await serve({ maxBytes: 64 })(formWith(new File([new Uint8Array(200)], "big.bin")))).status,
		).toBe(413);
	});

	it("answers a missing file field with 400", async () => {
		const form = new FormData();
		form.set("name", "ada");
		expect((await serve({})(form)).status).toBe(400);
	});
});

describe("sniffType", () => {
	it("recognises common formats by their first bytes", () => {
		expect(sniffType(PNG)).toBe("image/png");
		expect(sniffType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
		expect(sniffType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
		expect(sniffType(new TextEncoder().encode("hello"))).toBeUndefined();
	});
});
