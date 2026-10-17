import { defineHandler } from "spacefn";

export const GET = defineHandler((c) => ({ id: c.req.param("id") }));
