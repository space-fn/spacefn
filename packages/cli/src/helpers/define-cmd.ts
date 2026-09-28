import { defineCommand, type CommandDef } from "citty";

export interface CmdMeta {
  name: string;
  description: string;
  version?: string;
}

export interface CmdArgs {
  [key: string]: {
    type: "string" | "boolean" | "number";
    description?: string;
    required?: boolean;
    default?: unknown;
    alias?: string;
  };
}

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
 *     // Your seed logic here
 *   },
 * });
 * ```
 */
export function defineCmd(options: CmdOptions): CommandDef {
  return defineCommand({
    meta: options.meta,
    args: options.args ?? {},
    async run(ctx) {
      await options.run({ args: ctx.args, cmd: ctx.cmd });
    },
  });
}
