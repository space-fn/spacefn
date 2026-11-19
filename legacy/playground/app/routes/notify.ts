import { queues } from "@space/queues";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async () => {
	await queues.emails.send({ to: "a@example.test", subject: "hi" });
	return { queued: true };
});
