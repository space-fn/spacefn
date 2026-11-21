import { defineEnv, Env } from "spacefn";

export default defineEnv({ GREETING: Env.string(), API_KEY: Env.secret() });
