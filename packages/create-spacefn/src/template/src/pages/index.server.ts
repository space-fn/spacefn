import { defineLoader } from "@spacefn/asteroids/hono";

export const loader = defineLoader(async (c) => {
  return { msg: "Hello World!" };
});
