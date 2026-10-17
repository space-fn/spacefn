import { defineQueue } from "spacefn/queues";

export default defineQueue<{ to: string; subject: string }>(async (batch) => {
	for (const message of batch.messages) {
		console.log("EMAIL", message.body.to, message.body.subject);
		message.ack();
	}
});
