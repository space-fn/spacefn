import { defineCommand, type ArgDef, type ArgsDef, type CommandDef } from "citty";

export interface CmdMeta {
	name: string;
	description: string;
	version?: string;
}

/** A numeric arg. Citty parses it as a string; `defineCmd` coerces the parsed value to a number. */
export interface NumberArgDef {
	type: "number";
	description?: string;
	required?: boolean;
	default?: number;
	alias?: string | string[];
	valueHint?: string;
}

/** Argument definitions: citty's `ArgsDef` ("string" | "boolean" | "positional") plus "number". */
export type CmdArgs = Record<string, ArgDef | NumberArgDef>;

export interface CmdHandler {
	(ctx: { args: Record<string, any>; cmd: CommandDef }): Promise<void> | void;
}

export interface CmdOptions {
	meta: CmdMeta;
	args?: CmdArgs;
	run: CmdHandler;
}

/**
 * Define a custom script for `space run`.
 *
 * @example
 * ```ts
 * import { defineCmd } from "@spacefn/cli";
 *
 * export default defineCmd({
 *   meta: { name: "db:seed", description: "Seed the database" },
 *   args: {
 *     count: { type: "number", description: "Number of records", default: 10 },
 *     clear: { type: "boolean", description: "Clear existing data first", alias: "c" },
 *   },
 *   async run({ args }) {
 *     console.log(`Seeding ${args.count} records...`);
 *     if (args.clear) console.log("Clearing existing data...");
 *
 *     // Your seed logic here
 *   },
 * });
 * ```
 */
export function defineCmd(options: CmdOptions): CommandDef {
	return defineCommand({
		meta: options.meta,
		args: toCittyArgs(options.args ?? {}),
		async run(ctx) {
			coerceArgs(options.args ?? {}, ctx.args as Record<string, unknown>);
			await options.run({ args: ctx.args, cmd: ctx.cmd });
		},
	});
}

/** Map "number" args onto citty's string args (values coerced back in `run`). */
function toCittyArgs(args: CmdArgs): ArgsDef {
	const out: ArgsDef = {};
	for (const [name, def] of Object.entries(args)) {
		out[name] =
			def.type === "number"
				? {
						...def,
						type: "string",
						default: def.default === undefined ? undefined : String(def.default),
					}
				: def;
	}
	return out;
}

function coerceArgs(args: CmdArgs, parsed: Record<string, unknown>): void {
	for (const [name, def] of Object.entries(args)) {
		const value = parsed[name];
		if (def.type === "number" && typeof value === "string" && value !== "") {
			parsed[name] = Number(value);
		}
	}
}
