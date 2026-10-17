import { boolean, defineEnv, number, secret, string } from "spacefn/env";

export default defineEnv({
	GREETING: string({ default: "hello" }),
	MAX_ITEMS: number({ default: 10 }),
	VERBOSE: boolean({ default: false }),
	API_KEY: secret(),
	WEBHOOK_URL: secret({ optional: true }),
	OTLP_ENDPOINT: string({ optional: true }),
	OTLP_HEADERS: secret({ optional: true }),
});
