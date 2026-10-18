import { defineHandler } from "spacefn";
import { env } from "spacefn/env";

export const GET = defineHandler(() => {
	return { message: env.GREETING };
});
