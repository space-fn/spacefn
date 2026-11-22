import { Effect } from "effect";

import { SpaceError } from "../errors.ts";
import { CODE_FILE } from "./route-path.ts";

const UNIT_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * The name of a single-file unit (queue, cron, Durable Object, workflow) or a
 * database folder: `order-jobs.ts` gives `order-jobs`. Names become Cloudflare
 * resource names and binding names, so they are lowercase with `-`.
 */
export const unitName = (folder: string, file: string): Effect.Effect<string, SpaceError> => {
	const name = file.replace(CODE_FILE, "");
	return UNIT_NAME.test(name)
		? Effect.succeed(name)
		: Effect.fail(
				new SpaceError({
					code: "NAME_INVALID",
					message: `"${name}" is not a valid name`,
					hint: "Use lowercase letters, digits and -, starting with a letter (e.g. order-jobs).",
					file: `app/${folder}/${file}`,
				}),
			);
};

/** `order-jobs` gives `OrderJobs`, the exported class name of a Durable Object or workflow. */
export const pascalName = (name: string): string =>
	name
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");

/** `("QUEUE", "order-jobs")` gives `QUEUE_ORDER_JOBS`, the runtime binding name. */
export const bindingName = (prefix: string, name: string): string =>
	`${prefix}_${name.replaceAll("-", "_").toUpperCase()}`;
