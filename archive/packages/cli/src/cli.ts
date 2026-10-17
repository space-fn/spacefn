#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
	meta: {
		name: "space",
		version: "0.1.0",
		description: "SpaceFn unified CLI — dev, build, fmt, lint, and script runner",
	},
	subCommands: {
		dev: () => import("./commands/dev.js").then((m) => m.default),
		build: () => import("./commands/build.js").then((m) => m.default),
		fmt: () => import("./commands/fmt.js").then((m) => m.default),
		lint: () => import("./commands/lint.js").then((m) => m.default),
		check: () => import("./commands/check.js").then((m) => m.default),
		test: () => import("./commands/test.js").then((m) => m.default),
		run: () => import("./commands/run.js").then((m) => m.default),
		"db:generate": () => import("./commands/db/generate.js").then((m) => m.default),
		"db:migrate": () => import("./commands/db/migrate.js").then((m) => m.default),
	},
});

runMain(main);
