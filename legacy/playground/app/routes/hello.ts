import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(() => ({ message: "hello" }));
