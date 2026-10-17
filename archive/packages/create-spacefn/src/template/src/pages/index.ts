import { defineLoader, defineActions, definePage, html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

export const loader = defineLoader(async () => {
  return { title: "Home" };
});

export const actions = defineActions({
  signup: { method: "post", resolver: async (c) => c.json({ ok: true }) },
  signin: { method: "post", resolver: async (c) => c.json({ ok: true }) },
});

export default definePage<typeof loader>((data) => {
  return html(
    h.html(
      { lang: "en" },
      h.head(
        {},
        h.title({}, data.title),
        h.meta({ name: "description", content: data.title }),
        h.meta({ name: "viewport", content: "width=device-width, initial-scale=1.0" }),
      ),
      h.body({}, h.main({}, h.h1({}, data.title), h.p({}, "Welcome to your SpaceFn app"))),
    ),
  );
});
