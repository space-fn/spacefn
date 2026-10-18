import { Hono } from "hono";
import { expect, test } from "vite-plus/test";

import { defineHandler } from "../src/index";

function call(handler: Parameters<typeof defineHandler>[0]) {
  const app = new Hono();
  app.get("/", defineHandler(handler));
  return app.request("/");
}

test("passes a Response through", async () => {
  const res = await call(() => new Response("raw", { status: 201 }));
  expect(res.status).toBe(201);
  expect(await res.text()).toBe("raw");
});

test("turns a string into text", async () => {
  const res = await call(() => "hello");
  expect(res.headers.get("content-type")).toContain("text/plain");
  expect(await res.text()).toBe("hello");
});

test("turns an object into JSON", async () => {
  const res = await call(() => ({ ok: true }));
  expect(await res.json()).toEqual({ ok: true });
});

test("turns undefined into 204", async () => {
  const res = await call(() => undefined);
  expect(res.status).toBe(204);
});

test("awaits async handlers", async () => {
  const res = await call(async () => ({ n: 1 }));
  expect(await res.json()).toEqual({ n: 1 });
});
