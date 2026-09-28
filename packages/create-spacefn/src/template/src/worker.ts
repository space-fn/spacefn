import { Hono } from "hono";
import { html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

const app = new Hono();

app.get("/", (c) => {
  return html(
    h.html(
      {},
      h.head({}, h.title({}, "{{app_name}}")),
      h.body({}, h.h1({}, "Hello from SpaceFn!"), h.p({}, "Your app is running.")),
    ),
  );
});

export default app;
