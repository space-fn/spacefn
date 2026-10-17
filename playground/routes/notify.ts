import { defineHandler } from "spacefn";

import { queues } from "../.space/queues";

export const POST = defineHandler(async () => {
	await queues.emails.send({ to: "a@example.test", subject: "hi" });
	return { queued: true };
});
