import { describe, expect, test } from "vite-plus/test";

import { acceptSocket, broadcast, readMessage, requireWebSocket } from "../src/ws";

describe("requireWebSocket", () => {
	test("rejects non-upgrade", () => {
		const req = new Request("http://localhost/");
		expect(() => requireWebSocket(req)).toThrow(/Expected a WebSocket upgrade/);
	});

	test("rejects bad origin", () => {
		const req = new Request("http://localhost/", {
			headers: { Upgrade: "websocket", Origin: "https://evil.com" },
		});
		expect(() => requireWebSocket(req, ["https://ok.com"])).toThrow(/not allowed/);
	});

	test("allows valid origin", () => {
		const req = new Request("http://localhost/", {
			headers: { Upgrade: "websocket", Origin: "https://ok.com" },
		});
		expect(() => requireWebSocket(req, ["https://ok.com"])).not.toThrow();
	});
});

describe("readMessage", () => {
	test("returns raw when no parser", () => {
		const r = readMessage("hi");
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toBe("hi");
	});

	test("oversize closes with 1009", () => {
		const r = readMessage("x".repeat(10), { maxSize: 5 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe(1009);
	});

	test("parse failure closes with 1008", () => {
		const r = readMessage("bad", {
			parse: () => {
				throw new Error("nope");
			},
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.code).toBe(1008);
			expect(r.reason).toBe("nope");
		}
	});

	test("parse success", () => {
		const r = readMessage('{"a":1}', { parse: (raw) => JSON.parse(raw) as { a: number } });
		expect(r.ok).toBe(true);
		if (r.ok) expect((r.value as { a: number }).a).toBe(1);
	});
});

describe("broadcast", () => {
	test("sends to all except", () => {
		const sent: string[] = [];
		const a = { send: (m: string) => sent.push(`a:${m}`) } as unknown as WebSocket;
		const b = { send: (m: string) => sent.push(`b:${m}`) } as unknown as WebSocket;
		const ctx = { getWebSockets: () => [a, b] };
		broadcast(ctx, { hi: 1 }, { except: a });
		expect(sent).toEqual(['b:{"hi":1}']);
	});
});

describe("acceptSocket", () => {
	test("validates upgrade (node cannot build 101 response)", () => {
		const req = new Request("http://localhost/", { headers: { Upgrade: "websocket" } });
		let accepted = false;
		const ctx = {
			acceptWebSocket: () => {
				accepted = true;
			},
		};
		(globalThis as { WebSocketPair?: unknown }).WebSocketPair = class {
			0 = { send() {} } as unknown as WebSocket;
			1 = { serializeAttachment() {}, accept() {} } as unknown as WebSocket;
		};
		try {
			acceptSocket(ctx, req);
		} catch {
			// 101 response construction fails in node; acceptWebSocket was still called
		}
		expect(accepted).toBe(true);
		delete (globalThis as { WebSocketPair?: unknown }).WebSocketPair;
	});

	test("rejects non-upgrade", () => {
		const req = new Request("http://localhost/");
		const ctx = { acceptWebSocket: () => {} };
		expect(() => acceptSocket(ctx, req)).toThrow();
	});
});
