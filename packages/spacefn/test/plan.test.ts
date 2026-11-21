import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { planApp } from "../src/codegen/plan.ts";
import type { AppTree } from "../src/codegen/scan-app.ts";
import type { ResolvedSpaceConfig } from "../src/space-config.ts";

const tree = (parts: Partial<AppTree> = {}): AppTree => ({
	env: false,
	layers: false,
	viteConfig: false,
	infraConfig: false,
	routes: [],
	queues: [],
	crons: [],
	cronSources: {},
	uses: { kv: false, blob: false },
	durableObjects: [],
	workflows: [],
	client: [],
	db: [],
	gitignore: "node_modules\n.space/\n",
	...parts,
});

const config = (parts: Partial<ResolvedSpaceConfig> = {}): ResolvedSpaceConfig => ({
	target: "cloudflare",
	name: "todo",
	aliases: {},
	db: {},
	...parts,
});

const plan = (t: AppTree, c = config(), mode: "dev" | "prod" = "dev") =>
	Effect.runSync(planApp(t, c, mode));
const planError = (t: AppTree, c = config(), mode: "dev" | "prod" = "dev") =>
	Effect.runSync(Effect.flip(planApp(t, c, mode)));

describe("planApp routes", () => {
	it("orders routes most specific first, with app-relative files", () => {
		const result = plan(
			tree({ routes: ["api/users/[id].ts", "api/users/me.ts", "_util.ts", "index.ts"] }),
		);
		expect(result.routes.map((r) => [r.path, r.file])).toEqual([
			["/", "app/routes/index.ts"],
			["/api/users/me", "app/routes/api/users/me.ts"],
			["/api/users/:id", "app/routes/api/users/[id].ts"],
		]);
	});

	it("keeps only the current mode's files", () => {
		const t = tree({ routes: ["debug.dev.ts", "metrics.prod.ts"] });
		expect(plan(t, config(), "dev").routes.map((r) => r.path)).toEqual(["/debug"]);
		expect(plan(t, config(), "prod").routes.map((r) => r.path)).toEqual(["/metrics"]);
	});

	it("rejects two files that serve the same requests, even with different param names", () => {
		for (const routes of [
			["users.ts", "users/index.ts"],
			["users/[id].ts", "users/[userId].ts"],
		]) {
			const error = planError(tree({ routes }));
			expect(error.code).toBe("ROUTE_DUP");
		}
	});

	it("points a bad segment at the file under app/", () => {
		expect(planError(tree({ routes: ["[user-id].ts"] })).file).toBe("app/routes/[user-id].ts");
	});
});

describe("planApp units", () => {
	it("finds _middleware.ts in app/routes/, outer folders first, skipping private folders", () => {
		const result = plan(
			tree({
				routes: [
					"admin/users/_middleware.ts",
					"_middleware.ts",
					"admin/_middleware.ts",
					"(shop)/_middleware.ts",
					"_shared/_middleware.ts",
					"admin/_middleware.test.ts",
					"admin/index.ts",
				],
			}),
		);
		expect(result.middleware).toEqual([
			{ folder: "app/routes", file: "app/routes/_middleware.ts" },
			{ folder: "app/routes/(shop)", file: "app/routes/(shop)/_middleware.ts" },
			{ folder: "app/routes/admin", file: "app/routes/admin/_middleware.ts" },
			{ folder: "app/routes/admin/users", file: "app/routes/admin/users/_middleware.ts" },
		]);
		expect(result.routes.map((r) => r.file)).toEqual(["app/routes/admin/index.ts"]);
	});

	it("names queues, crons, Durable Objects and workflows from their files", () => {
		const result = plan(
			tree({
				queues: ["emails.ts", "notes.md"],
				crons: ["nightly.ts"],
				cronSources: { "nightly.ts": 'export default cron(\n\t"0  3 * * *",\n\tjob,\n);' },
				durableObjects: ["chat-room.ts"],
				workflows: ["order-flow.ts"],
			}),
		);
		expect(result.queues).toEqual([
			{ name: "emails", file: "app/queues/emails.ts", binding: "QUEUE_EMAILS" },
		]);
		expect(result.crons).toEqual([
			{ name: "nightly", file: "app/crons/nightly.ts", schedule: "0 3 * * *" },
		]);
		expect(result.durableObjects).toEqual([
			{
				name: "chat-room",
				file: "app/durable-objects/chat-room.ts",
				binding: "DO_CHAT_ROOM",
				className: "ChatRoom",
			},
		]);
		expect(result.workflows[0]).toMatchObject({ className: "OrderFlow", binding: "WF_ORDER_FLOW" });
	});

	it("accepts scripts and stylesheets as client entries but not two with one name", () => {
		expect(plan(tree({ client: ["main.ts", "style.css", "types.d.ts"] })).client).toEqual([
			"app/client/main.ts",
			"app/client/style.css",
		]);
		expect(planError(tree({ client: ["main.css", "main.ts"] })).code).toBe("CLIENT_DUP_ENTRY");
	});
});

describe("planApp target and config checks", () => {
	it("allows Durable Objects and workflows only on Cloudflare", () => {
		const error = planError(tree({ durableObjects: ["room.ts"] }), config({ target: "bun" }));
		expect(error).toMatchObject({
			code: "TARGET_UNSUPPORTED",
			file: "app/durable-objects/room.ts",
		});
		expect(planError(tree({ workflows: ["flow.ts"] }), config({ target: "bun" })).code).toBe(
			"TARGET_UNSUPPORTED",
		);
	});

	it("gives each database the target's default driver unless the config names one", () => {
		const db = [
			{ name: "main", migrations: [], queries: [] },
			{ name: "rooms", migrations: [], queries: [] },
		];
		const cf = plan(tree({ db }), config({ db: { rooms: "durable-object" } }));
		expect(cf.db.map((d) => [d.name, d.driver, d.binding])).toEqual([
			["main", "d1", "DB_MAIN"],
			["rooms", "durable-object", "DB_ROOMS"],
		]);
		expect(plan(tree({ db }), config({ target: "bun" })).db.map((d) => d.driver)).toEqual([
			"libsql",
			"libsql",
		]);
	});

	it("rejects Cloudflare-only drivers on Bun and drivers for missing folders", () => {
		const db = [{ name: "main", migrations: [], queries: [] }];
		expect(planError(tree({ db }), config({ target: "bun", db: { main: "d1" } })).code).toBe(
			"TARGET_UNSUPPORTED",
		);
		expect(planError(tree({ db }), config({ db: { other: "d1" } })).code).toBe("DB_UNKNOWN");
	});

	it("rejects a @param type the generated types cannot express", () => {
		const query = {
			name: "find",
			mode: "one" as const,
			sql: "",
			boundSql: "",
			columns: [],
			paramNames: ["id"],
			paramTypes: { id: "int" },
			parts: [],
		};
		const error = planError(tree({ db: [{ name: "main", migrations: [], queries: [query] }] }));
		expect(error).toMatchObject({ code: "DB_PARAM_TYPE", file: "app/db/main/queries" });
	});

	it("requires .space/ in .gitignore", () => {
		for (const gitignore of [".space", "/.space/", "dist\n.space/\n"])
			expect(plan(tree({ gitignore })).target, gitignore).toBe("cloudflare");
		for (const gitignore of [undefined, "dist\n", ".spaceship\n", "# .space\n"])
			expect(planError(tree({ gitignore })).code, String(gitignore)).toBe("GITIGNORE_SPACE");
	});

	it.effect("needs each cron schedule as a valid string literal", () =>
		Effect.gen(function* () {
			const code = (source: string) =>
				Effect.flip(
					planApp(tree({ crons: ["x.ts"], cronSources: { "x.ts": source } }), config(), "dev"),
				).pipe(Effect.map((error) => error.code));
			expect(yield* code("export default cron(SCHEDULE, job);")).toBe("CRON_SCHEDULE_LITERAL");
			expect(yield* code("export default cron(`${m} * * * *`, job);")).toBe(
				"CRON_SCHEDULE_LITERAL",
			);
			expect(yield* code('export default cron("daily", job);')).toBe("CRON_SCHEDULE");
		}),
	);
});
