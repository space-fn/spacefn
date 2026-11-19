#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Result, Stream } from "effect";
import { Command, Flag } from "effect/cli";
import { formatSpaceError, type SpaceError } from "spacefn";
import { gen, watchGen, type WriteResult } from "spacefn/codegen";

const summary = (result: WriteResult) => {
	const changes = [
		...result.written.map((file) => `  wrote   .space/${file}`),
		...result.removed.map((file) => `  removed .space/${file}`),
	];
	return changes.length === 0 ? "space gen: up to date" : ["space gen:", ...changes].join("\n");
};

const fail = (error: SpaceError) =>
	Console.error(formatSpaceError(error)).pipe(
		Effect.andThen(
			Effect.sync(() => {
				process.exitCode = 1;
			}),
		),
	);

const genCommand = Command.make(
	"gen",
	{
		watch: Flag.Boolean("watch").pipe(
			Flag.withAlias("w"),
			Flag.withDescription("Regenerate whenever app/ or configs/ change"),
			Flag.withDefault(false),
		),
		prod: Flag.Boolean("prod").pipe(
			Flag.withDescription("Include .prod.ts files instead of .dev.ts files"),
			Flag.withDefault(false),
		),
	},
	Effect.fn(function* ({ watch, prod }) {
		const root = process.cwd();
		const mode = prod ? "prod" : "dev";
		if (!watch)
			return yield* gen(root, mode).pipe(
				Effect.flatMap((result) => Console.log(summary(result))),
				Effect.catchTag("SpaceError", fail),
			);
		yield* watchGen(root, mode).pipe(
			Stream.runForEach((result) =>
				Result.isSuccess(result)
					? Console.log(summary(result.success))
					: Console.error(formatSpaceError(result.failure)),
			),
		);
	}),
).pipe(Command.withDescription("Generate .space/ from app/ and configs/space.ts"));

Command.make("space").pipe(
	Command.withDescription("spacefn: folder-convention apps on Effect"),
	Command.withSubcommands([genCommand]),
	Command.run({ version: "0.11.0-alpha.0" }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain,
);
