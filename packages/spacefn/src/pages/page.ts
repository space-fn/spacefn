import { Effect, Layer, Predicate, Schema, SchemaIssue } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import { BadRequest, NotFound, SpaceError } from "../errors.ts";
import type { Html } from "../html.ts";
import { mediaType, readSimpleBody } from "../http/body.ts";
import { readMultipart, type UploadLimits } from "../http/multipart.ts";
import { handleErrors, htmlResponse, toResponse } from "../http/respond.ts";
import { CurrentRoute, METHODS } from "../http/route.ts";
import type { ManifestRoute, Unchecked } from "../manifest.ts";

type Response = HttpServerResponse.HttpServerResponse;

/** A form action: its input schema and the handler that runs on a valid submission. */
export interface Action<A = any, B = any, E = any, R = any> {
	readonly input: Schema.Codec<A, any, any>;
	/** Return data to re-render the page with `ctx.action.data`, or a response (e.g. `redirect`). */
	readonly handler: (input: A) => Effect.Effect<B, E, R>;
	/** Body limits, as for `Input.body`. */
	readonly limits?: UploadLimits;
}

/**
 * Declares a page action. The input is the form (URL-encoded or multipart) or
 * the JSON a Datastar action sends, decoded with `input` before `handler` runs.
 */
export const action = <A, I, RD, B, E, R>(definition: {
	readonly input: Schema.Codec<A, I, RD>;
	readonly handler: (input: A) => Effect.Effect<B, E, R>;
	readonly limits?: UploadLimits;
}): Action<A, B, E, R | RD> => definition as Action<A, B, E, R | RD>;

type Actions = Readonly<Record<string, Action>>;

export interface Issue {
	/** Dotted path of the field, e.g. `address.city`; empty for the whole input. */
	readonly path: string;
	readonly message: string;
}

type ActionData<T> = T extends Action<any, infer B> ? Exclude<B, Response> : never;

/** What the last submission did, for `render`: its data, or the issues that stopped it. */
export type ActionState<Acts extends Actions> = {
	[K in keyof Acts & string]:
		| { readonly name: K; readonly ok: true; readonly data: ActionData<Acts[K]> }
		| {
				readonly name: K;
				readonly ok: false;
				readonly issues: readonly Issue[];
				/** What was submitted, to fill the form again. */
				readonly values: Readonly<Record<string, unknown>>;
		  };
}[keyof Acts & string];

export interface ActionTarget {
	/** `?__action=<name>`: relative, so it posts to the page itself. */
	readonly url: string;
	readonly method: "post";
}

export interface PageContext<L, Acts extends Actions> {
	readonly loaderData: L;
	/** Set when this render answers a submission. */
	readonly action: ActionState<Acts> | undefined;
	/** Where each action posts: `<form method="post" action="${ctx.actions.add.url}">`. */
	readonly actions: { readonly [K in keyof Acts]: ActionTarget };
	readonly url: URL;
}

export interface PageDefinition<L, Acts extends Actions> {
	/** Reads input and services; return a response (e.g. `redirect`) to answer instead of rendering. */
	readonly loader?: Effect.Effect<L, any, any>;
	readonly actions?: Acts;
	readonly render: (ctx: PageContext<Exclude<L, Response>, Acts>) => Html;
}

const PageTypeId = "~spacefn/Page";

export interface Page<L = any, Acts extends Actions = any> {
	readonly [PageTypeId]: typeof PageTypeId;
	readonly definition: PageDefinition<L, Acts>;
}

/**
 * Declares a file in `app/pages/`. Keep `loader` and `actions` before `render`
 * so their types reach `ctx`. Write the loader with `Effect.gen` or `.pipe`:
 * TypeScript can't infer `loaderData` through the data-first
 * `Effect.map(effect, (x) => ...)`.
 *
 * ```ts
 * export default page({
 *   loader: Effect.gen(function* () {
 *     const db = yield* MainDb;
 *     return { todos: yield* db.listTodos() };
 *   }),
 *   actions: {
 *     add: action({
 *       input: Schema.Struct({ title: Schema.NonEmptyString }),
 *       handler: ({ title }) => Effect.flatMap(MainDb, (db) => db.addTodo({ title })),
 *     }),
 *   },
 *   render: (ctx) => html`
 *     <form method="post" action="${ctx.actions.add.url}"><input name="title" /></form>
 *     <ul>${ctx.loaderData.todos.map((todo) => html`<li>${todo.title}</li>`)}</ul>`,
 * });
 * ```
 */
export const page = <L = undefined, const Acts extends Actions = {}>(
	definition: PageDefinition<L, Acts>,
): Page<L, Acts> => ({ [PageTypeId]: PageTypeId, definition });

export const isPage = (value: unknown): value is Page => Predicate.hasProperty(value, PageTypeId);

const ACTION_PARAM = "__action";

const issuesOf = SchemaIssue.makeFormatterStandardSchemaV1();

const toIssues = (error: Schema.SchemaError): Issue[] =>
	issuesOf(error.issue).issues.map((issue) => ({
		path: (issue.path ?? []).map(String).join("."),
		message: issue.message,
	}));

type AnyPage = PageDefinition<unknown, Actions>;
// Requirements are erased, as for routes: the router provides the request and
// the target provides the app's services around it.
type Eff<A> = Effect.Effect<A, unknown, any>;

const load = (page: AnyPage): Eff<unknown> =>
	(page.loader ?? Effect.succeed(undefined)) as Eff<unknown>;

const contextFor = (
	page: AnyPage,
	request: HttpServerRequest.HttpServerRequest,
	loaderData: unknown,
	action: ActionState<Actions> | undefined,
): PageContext<unknown, Actions> => ({
	loaderData,
	action,
	actions: Object.fromEntries(
		Object.keys(page.actions ?? {}).map((name) => [
			name,
			{ url: `?${ACTION_PARAM}=${encodeURIComponent(name)}`, method: "post" },
		]),
	),
	url: new URL(request.originalUrl, "http://localhost"),
});

/** Runs the loader, then renders; a loader that returns a response answers instead. */
const renderPage = (
	page: AnyPage,
	action: ActionState<Actions> | undefined,
	status?: number,
): Eff<Response> =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const data = yield* load(page);
		if (HttpServerResponse.isHttpServerResponse(data)) return data;
		return htmlResponse(page.render(contextFor(page, request, data, action)), { status });
	}) as Eff<Response>;

const readInput = (limits: UploadLimits | undefined) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		return mediaType(request) === "multipart/form-data"
			? yield* readMultipart(limits)
			: yield* readSimpleBody(limits);
	});

const runAction = (page: AnyPage): Eff<Response> =>
	Effect.gen(function* () {
		const search = yield* HttpServerRequest.ParsedSearchParams;
		const name = search[ACTION_PARAM];
		if (typeof name !== "string")
			return yield* new BadRequest({ message: `Name the action with ?${ACTION_PARAM}=` });
		const actions = page.actions ?? {};
		const chosen = Object.hasOwn(actions, name) ? actions[name] : undefined;
		if (!chosen) return yield* new NotFound({ message: `No action ${name}` });

		const values = yield* readInput(chosen.limits);
		const decoded = yield* Effect.result(Schema.decodeUnknownEffect(chosen.input)(values));
		if (decoded._tag === "Failure")
			return yield* renderPage(
				page,
				{
					name,
					ok: false,
					issues: toIssues(decoded.failure),
					values: values as Record<string, unknown>,
				},
				422,
			);
		const result = yield* chosen.handler(decoded.success) as Eff<unknown>;
		if (HttpServerResponse.isHttpServerResponse(result)) return result;
		return yield* renderPage(page, { name, ok: true, data: result as never });
	}) as Eff<Response>;

const notAllowed = (allowed: readonly string[]) =>
	HttpServerResponse.jsonUnsafe(
		{ error: "MethodNotAllowed", message: `Use ${allowed.join(", ")}` },
		{ status: 405, headers: { allow: allowed.join(", ") } },
	);

const definitionOf = (entry: Unchecked<ManifestRoute>): Effect.Effect<AnyPage, SpaceError> => {
	const value = (entry.module as { default?: unknown }).default;
	return isPage(value)
		? Effect.succeed(value.definition as AnyPage)
		: Effect.fail(
				new SpaceError({
					code: "PAGE_EXPORT",
					message: "The default export is not a page",
					hint: "Export the page with: export default page({ render: (ctx) => html`...` })",
					file: entry.file,
				}),
			);
};

/**
 * Registers every page of the manifest: GET renders, POST runs the action named by `?__action=`. A
 * failing loader or handler is answered like a route's.
 */
export const pagesLayer = (
	routes: readonly Unchecked<ManifestRoute>[],
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.effectDiscard(
		Effect.gen(function* () {
			const router = yield* HttpRouter.HttpRouter;
			for (const entry of routes) {
				if (entry.kind !== "page") continue;
				const definition = yield* definitionOf(entry);
				const current = CurrentRoute.of({ file: entry.file, catchAll: entry.catchAll });
				const serve = (effect: Eff<Response>) =>
					handleErrors(Effect.flatMap(effect, toResponse)).pipe(
						Effect.provideService(CurrentRoute, current),
					) as Effect.Effect<Response>;
				yield* router.add("GET", entry.path, serve(renderPage(definition, undefined)));
				const allowed = definition.actions ? ["GET", "POST"] : ["GET"];
				if (definition.actions) yield* router.add("POST", entry.path, serve(runAction(definition)));
				for (const method of METHODS)
					if (!allowed.includes(method))
						yield* router.add(method, entry.path, Effect.succeed(notAllowed(allowed)));
			}
		}),
	);
