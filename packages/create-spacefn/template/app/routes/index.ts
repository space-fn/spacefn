import { env } from "spacefn/env";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(() => {
	return { message: env.GREETING };
});
