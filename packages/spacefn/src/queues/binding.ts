import { baseName } from "../scan";

/** The producer binding for `queues/<file>`: `emails.ts` becomes `QUEUE_EMAILS`. */
export function queueBinding(file: string): string {
	return `QUEUE_${baseName(file)
		.replace(/[^A-Za-z0-9]/g, "_")
		.toUpperCase()}`;
}
