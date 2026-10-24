import { env } from "spacefn/env";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(() => ({
	greeting: env.GREETING,
	maxItems: env.MAX_ITEMS,
	verbose: env.VERBOSE,
	hasKey: env.API_KEY.length > 0,
	hasWebhook: env.WEBHOOK_URL !== undefined,
}));
