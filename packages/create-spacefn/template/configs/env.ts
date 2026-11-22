// Deploys import this file to learn which variables to pass on, so it imports only spacefn and effect.
import { defineEnv, Env } from "spacefn";

export default defineEnv({
	GREETING: Env.string({ default: "Hello from spacefn" }),
});
