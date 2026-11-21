import { Effect, Layer, Predicate, Schema, SchemaIssue } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import { BadRequest, NotFound, SpaceError } from "../errors.ts";
import type { Html } from "../html.ts";
import { mediaType, readSimpleBody } from "../http/body.ts";
import { noMiddleware, type AroundRoute } from "../http/middleware.ts";
import { readMultipart, type UploadLimits } from "../http/multipart.ts";
import { handleErrors, htmlResponse, toResponse } from "../http/respond.ts";
import { CurrentRoute, METHODS } from "../http/route.ts";
import type { ManifestRoute, Unchecked } from "../manifest.ts";
import { Datastar } from "./datastar.ts";

type Response = HttpServerResponse.HttpServerResponse;

export type ActionMethod = "get" | "post";

/** A page action: its method, its input schema and the handler that runs on valid input. */
export interface Action<A = any, B = any, E = any, R = any, M extends ActionMethod = ActionMethod> {
	/** `post` (the default) reads the body; `get` reads the query string or Datastar's signals. */
	readonly method?: M;
	readonly input: Schema.Codec<A, any, any>;
	/** Return data to re-render the page with `ctx.actions.<name>.data`, or a response (e.g. `redirect`). */
	readonly handler: (input: A) => Effect.Effect<B, E, R>;
	/** Body limits, as for `Input.body`. */
	readonly limits?: UploadLimits;
}

/**
 * Declares a page action, decoding its input with `input` before `handler`
 * runs. A `post` action reads the form (URL-encoded or multipart) or the JSON
 * a Datastar `@post` sends; a `get` action reads the query string, or the
 * signals of a Datastar `@get`. A `get` action that returns `Datastar.watch`
 * keeps a page live.
 */
export const action = <A, I, RD, B, E, R, const M extends ActionMethod = "post">(definition: {
	readonly method?: M;
	readonly input: Schema.Codec<A, I, RD>;
	readonly handler: (input: A) => Effect.Effect<B, E, R>;
	readonly limits?: UploadLimits;
	// NoInfer: the page's contextual `Action` type must not widen M past its default.
}): Action<A, B, E, R | RD, NoInfer<M>> => definition as Action<A, B, E, R | RD, M>;

type Actions = Readonly<Record<string, Action>>;

export interface Issue {
	/** Dotted path of the field, e.g. `address.city`; empty for the whole input. */
	readonly path: string;
	readonly message: string;
}

/** Why a submission didn't decode, typed from the action's input `A`. */
export interface ActionError<A = Record<string, unknown>> {
	/** Every issue, with its dotted path. */
	readonly issues: readonly Issue[];
	/** The first message for each field: `${ctx.actions.add.error?.fields.title}`. */
	readonly fields: { readonly [K in keyof A]?: string };
	/** What was submitted, to fill the form again. */
	readonly values: { readonly [K in keyof A]?: unknown };
}

/** One action, for `render`: where it goes, and what its submission did when this render answers one. */
export interface ActionContext<A = any, B = unknown, M extends ActionMethod = ActionMethod> {
	/** `?__action=<name>`: relative, so it goes to the page itself. */
	readonly url: string;
	readonly method: M;
	/**
	 * When this render answers a submission of this action: `true` if its handler
	 * ran, `false` if its input didn't decode. `undefined` otherwise.
	 */
	readonly ok: boolean | undefined;
	/** Set when this render answers a submission of this action that didn't decode (status 422). */
	readonly error: ActionError<A> | undefined;
	/** What the handler returned, when this render answers its submission. */
	readonly data: B | undefined;
}

type ContextOf<T> =
	T extends Action<infer A, infer B, any, any, infer M>
		? ActionContext<A, Exclude<B, Response>, M>
		: never;

export interface PageContext<L, Acts extends Actions> {
	/** What the loader returned. */
	readonly data: L;
	/** Each action: `<form method="${ctx.actions.add.method}" action="${ctx.actions.add.url}">`. */
	readonly actions: { readonly [K in keyof Acts]: ContextOf<Acts[K]> };
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
 * Declares a page, a file in `app/routes/`. Keep `loader` and `actions` before `render`
 * so their types reach `ctx`. Write the loader with `Effect.gen` or `.pipe`:
 * TypeScript can't infer `ctx.data` through the data-first
 * `Effect.map(effect, (x) => ...)`.
 *
 * ```ts
 * export default page({
 *   loader: Effect.gen(function* () {
 *     return { todos: yield* MainDb.listTodos() };
 *   }),
 *   actions: {
 *     add: action({
 *       input: Schema.Struct({ title: Schema.NonEmptyString }),
 *       handler: ({ title }) => MainDb.addTodo({ title }),
 *     }),
 *   },
 *   render: (ctx) => html`
 *     <form method="post" action="${ctx.actions.add.url}">
 *       <input name="title" />${ctx.actions.add.error?.fields.title}
 *     </form>
 *     <ul>${ctx.data.todos.map((todo) => html`<li>${todo.title}</li>`)}</ul>`,
 * });
 * ```
 */
export const page = <L = undefined, const Acts extends Actions = {}>(
	definition: PageDefinition<L, Acts>,
): Page<L, Acts> => ({ [PageTypeId]: PageTypeId, definition });

export const isPage = (value: unknown): value is Page => Predicate.hasProperty(value, PageTypeId);

const ACTION_PARAM = "__action";

/**
 * Where a page's action `name` is reached: `?__action=<name>`, relative, so it
 * goes to the page itself. `ctx.actions.<name>.url` in `render`; this, where
 * there's no `ctx`, as in a live action that renders part of the page again.
 */
export const actionUrl = (name: string): string => `?${ACTION_PARAM}=${encodeURIComponent(name)}`;

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

/** What a submission did, for the render that answers it. */
type Submission =
	| { readonly name: string; readonly ok: true; readonly data: unknown }
	| {
			readonly name: string;
			readonly ok: false;
			readonly issues: readonly Issue[];
			readonly values: Readonly<Record<string, unknown>>;
	  };

/** The first message per top-level field; issues about the whole input have no field. */
const fieldsOf = (issues: readonly Issue[]) => {
	const fields: Record<string, string> = {};
	for (const issue of issues) {
		const field = issue.path.split(".")[0]!;
		if (field !== "" && !(field in fields)) fields[field] = issue.message;
	}
	return fields;
};

const contextFor = (
	page: AnyPage,
	request: HttpServerRequest.HttpServerRequest,
	data: unknown,
	submission: Submission | undefined,
): PageContext<unknown, Actions> => ({
	data,
	actions: Object.fromEntries(
		Object.entries(page.actions ?? {}).map(([name, action]) => {
			const answered = submission?.name === name ? submission : undefined;
			const context: ActionContext = {
				url: actionUrl(name),
				method: action.method ?? "post",
				ok: answered?.ok,
				error:
					answered && !answered.ok
						? {
								issues: answered.issues,
								fields: fieldsOf(answered.issues),
								values: answered.values,
							}
						: undefined,
				data: answered?.ok ? answered.data : undefined,
			};
			return [name, context];
		}),
	) as PageContext<unknown, Actions>["actions"],
	url: new URL(request.originalUrl, "http://localhost"),
});

/** Runs the loader, then renders; a loader that returns a response answers instead. */
const renderPage = (
	page: AnyPage,
	submission: Submission | undefined,
	status?: number,
): Eff<Response> =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const data = yield* load(page);
		if (HttpServerResponse.isHttpServerResponse(data)) return data;
		return htmlResponse(page.render(contextFor(page, request, data, submission)), { status });
	}) as Eff<Response>;

const readInput = (method: ActionMethod, limits: UploadLimits | undefined) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		if (method === "get") {
			if (yield* Datastar.isRequest) return yield* Datastar.signals(Schema.Unknown);
			const { [ACTION_PARAM]: _, ...query } = yield* HttpServerRequest.ParsedSearchParams;
			return query;
		}
		return mediaType(request) === "multipart/form-data"
			? yield* readMultipart(limits)
			: yield* readSimpleBody(limits);
	});

const runAction = (page: AnyPage, method: ActionMethod): Eff<Response> =>
	Effect.gen(function* () {
		const search = yield* HttpServerRequest.ParsedSearchParams;
		const name = search[ACTION_PARAM];
		if (typeof name !== "string")
			return yield* new BadRequest({ message: `Name the action with ?${ACTION_PARAM}=` });
		const actions = page.actions ?? {};
		const chosen = Object.hasOwn(actions, name) ? actions[name] : undefined;
		if (!chosen) return yield* new NotFound({ message: `No action ${name}` });
		const expected = chosen.method ?? "post";
		if (expected !== method) return notAllowed([expected.toUpperCase()]);

		const values = yield* readInput(method, chosen.limits);
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
 * Registers every page of the manifest: GET renders, and the action named by
 * `?__action=` runs on its method. A failing loader or handler is answered
 * like a route's.
 */
export const pagesLayer = (
	routes: readonly Unchecked<ManifestRoute>[],
	around: AroundRoute = noMiddleware,
): Layer.Layer<never, SpaceError, HttpRouter.HttpRouter> =>
	Layer.effectDiscard(
		Effect.gen(function* () {
			const router = yield* HttpRouter.HttpRouter;
			for (const entry of routes) {
				const definition = yield* definitionOf(entry);
				const current = CurrentRoute.of({ file: entry.file, catchAll: entry.catchAll });
				const serve = (effect: Eff<Response>) =>
					handleErrors(around(entry.file, handleErrors(Effect.flatMap(effect, toResponse)))).pipe(
						Effect.provideService(CurrentRoute, current),
					) as Effect.Effect<Response>;
				const get = Effect.flatMap(HttpServerRequest.ParsedSearchParams, (search) =>
					ACTION_PARAM in search ? runAction(definition, "get") : renderPage(definition, undefined),
				);
				yield* router.add("GET", entry.path, serve(get));
				const posts = Object.values(definition.actions ?? {}).some(
					(a) => (a.method ?? "post") === "post",
				);
				const allowed = posts ? ["GET", "POST"] : ["GET"];
				if (posts) yield* router.add("POST", entry.path, serve(runAction(definition, "post")));
				for (const method of METHODS)
					if (!allowed.includes(method))
						yield* router.add(method, entry.path, Effect.succeed(notAllowed(allowed)));
			}
		}),
	);
