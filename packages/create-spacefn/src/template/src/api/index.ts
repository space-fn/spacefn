import { defineRoute } from "@spacefn/asteroids/hono";

export default defineRoute((c) => {
  return c.json({ message: "hello from api" });
});
