import { defineEnv, string } from "spacefn/env";

export default defineEnv({
	GREETING: string({ default: "hello" }),
});
