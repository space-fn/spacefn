import { Effect, Schema, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { BadRequest } from "../errors.ts";
import type { Html } from "../html.ts";
import { MiB, readWith, type BodyError } from "../http/body.ts";
import { badRequestFrom } from "../http/respond.ts";

/** One server-sent event in Datastar's protocol. */
export interface DatastarEvent {
	readonly event: "datastar-patch-elements" | "datastar-patch-signals";
	/** `key value` lines, written as `data:` lines in order. */
	readonly data: readonly string[];
	readonly id?: string;
	/** Reconnect delay in ms. Datastar's default is 1000. */
	readonly retry?: number;
}

export type PatchMode =
	| "outer"
	| "inner"
	| "replace"
	| "prepend"
	| "append"
	| "before"
	| "after"
	| "remove";

export interface PatchElementsOptions {
	/** CSS selector of the target. Without one, top-level elements are matched by `id`. */
	readonly selector?: string;
	/** How the elements land. Default `outer` (morph the matched element). */
	readonly mode?: PatchMode;
	readonly useViewTransition?: boolean;
	readonly namespace?: "html" | "svg" | "mathml";
	readonly id?: string;
}

const lines = (key: string, text: string) =>
	text.split(/\r\n|\r|\n/).map((line) => `${key} ${line}`);

const oneLine = (value: string, what: string) => {
	if (/[\r\n]/.test(value)) throw new TypeError(`Datastar ${what} can't contain a line break`);
	return value;
};

/** Morphs `elements` into the page. */
const patchElements = (elements: Html, options: PatchElementsOptions = {}): DatastarEvent => ({
	event: "datastar-patch-elements",
	data: [
		...(options.selector ? [`selector ${oneLine(options.selector, "selector")}`] : []),
		...(options.mode && options.mode !== "outer" ? [`mode ${options.mode}`] : []),
		...(options.useViewTransition ? ["useViewTransition true"] : []),
		...(options.namespace && options.namespace !== "html"
			? [`namespace ${options.namespace}`]
			: []),
		...(elements.value === "" ? [] : lines("elements", elements.value)),
	],
	...(options.id === undefined ? {} : { id: options.id }),
});

/** Removes the elements matching `selector`. */
const removeElements = (selector: string): DatastarEvent => ({
	event: "datastar-patch-elements",
	data: [`selector ${oneLine(selector, "selector")}`, "mode remove"],
});

/** Merges `signals` into the page's signals; `null` removes one. */
const patchSignals = (
	signals: Readonly<Record<string, unknown>>,
	options: { readonly onlyIfMissing?: boolean } = {},
): DatastarEvent => ({
	event: "datastar-patch-signals",
	data: [
		...(options.onlyIfMissing ? ["onlyIfMissing true"] : []),
		...lines("signals", JSON.stringify(signals)),
	],
});

/** Runs `script` in the browser once, then removes its `<script>` tag. */
const executeScript = (script: string): DatastarEvent => ({
	event: "datastar-patch-elements",
	data: [
		"selector body",
		"mode append",
		...lines(
			"elements",
			`<script data-effect="el.remove()">${script.replace(/<\/script/gi, "<\\/script")}</script>`,
		),
	],
});

/** The wire form of one event. */
export const encodeEvent = (event: DatastarEvent): string => {
	const out = [`event: ${event.event}`];
	if (event.id !== undefined) out.push(`id: ${oneLine(event.id, "id")}`);
	if (event.retry !== undefined && event.retry !== 1000) out.push(`retry: ${event.retry}`);
	for (const line of event.data) out.push(`data: ${line}`);
	return `${out.join("\n")}\n\n`;
};

const KEEPALIVE = ": keepalive\n\n";

/**
 * An event-stream response. A Stream keeps the connection open until it ends
 * or the client leaves, with a comment every 15 seconds so proxies don't
 * close an idle connection.
 */
const sse = <E, R>(
	events: Iterable<DatastarEvent> | Stream.Stream<DatastarEvent, E, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
	Effect.map(Effect.context<R>(), (context) => {
		const live = Stream.isStream(events);
		const body = live
			? (events as Stream.Stream<DatastarEvent, E, R>).pipe(
					Stream.map(encodeEvent),
					Stream.merge(Stream.as(Stream.tick("15 seconds"), KEEPALIVE).pipe(Stream.drop(1)), {
						haltStrategy: "left",
					}),
					Stream.provideContext(context),
				)
			: Stream.make(Array.from(events as Iterable<DatastarEvent>, encodeEvent).join(""));
		return HttpServerResponse.stream(Stream.encodeText(body), {
			contentType: "text/event-stream",
			headers: { "cache-control": "no-cache", "x-accel-buffering": "no" },
		});
	});

/** Whether the request came from a Datastar action (`@get`, `@post`, ...). */
const isRequest: Effect.Effect<boolean, never, HttpServerRequest.HttpServerRequest> = Effect.gen(
	function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		return request.headers["datastar-request"] === "true";
	},
);

/**
 * Decodes the signals a Datastar action sent: the `datastar` query parameter
 * on GET, the JSON body otherwise. A mismatch is a 400 listing the issues.
 */
const signals = <A, I, RD>(
	schema: Schema.Codec<A, I, RD>,
): Effect.Effect<A, BodyError, HttpServerRequest.HttpServerRequest | RD> =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const raw =
			request.method === "GET"
				? yield* Effect.try({
						try: () =>
							JSON.parse(
								new URL(request.originalUrl, "http://x").searchParams.get("datastar") ?? "{}",
							) as unknown,
						catch: () => new BadRequest({ message: "Malformed Datastar signals" }),
					})
				: yield* readWith(MiB, async (r) => JSON.parse(await r.text()) as unknown, "signals");
		return yield* Schema.decodeUnknownEffect(schema)(raw).pipe(
			Effect.mapError((error) => badRequestFrom("signals", error)),
		);
	});

/** Server side of Datastar: patch the page over SSE and read its signals. */
export const Datastar = {
	patchElements,
	removeElements,
	patchSignals,
	executeScript,
	sse,
	isRequest,
	signals,
} as const;
