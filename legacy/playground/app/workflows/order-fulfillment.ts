import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

export class OrderFulfillment extends WorkflowEntrypoint {
	async run(event: WorkflowEvent<{ orderId: string }>, step: WorkflowStep) {
		const validated = await step.do("validate", async () => {
			console.log("validating", event.payload.orderId);
			return true;
		});
		const charged = await step.do("charge", async () => {
			console.log("charging", event.payload.orderId);
			return validated;
		});
		return { orderId: event.payload.orderId, charged };
	}
}
