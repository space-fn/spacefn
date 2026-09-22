import { defineLoader } from "@spacefn/server";

export const loader = defineLoader(async (_req) => {
	return { msg: "Hello World!" };
});
