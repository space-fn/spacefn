import { bindings, triggers } from "cf/config";

import { baseName } from "../scan";
import { queueBinding } from "./binding";

/** The Worker config each `queues/` file implies: a consumer trigger and a producer binding. */
export function queueConfig(files: string[]) {
	const env: Record<string, ReturnType<typeof bindings.queue>> = {};
	const consumers = files.map((file) => {
		const name = baseName(file);
		env[queueBinding(file)] = bindings.queue({ name });
		return triggers.queue({ name });
	});
	return { env, triggers: consumers };
}
