import { Clock, Duration, Effect, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { Unauthorized } from "../errors.ts";
import { fromBase64Url, randomBytes, toBase64Url } from "./encoding.ts";

const TOKEN_BYTES = 32;
/** How stale `lastSeenAt` may grow before a request refreshes it. */
const TOUCH_AFTER = Duration.hours(1);

export interface SessionPolicy {
	/** Longest a session lasts from sign-in. Default 30 days. */
	readonly absolute?: Duration.Input;
	/** Longest a session may sit unused. Default 7 days. */
	readonly idle?: Duration.Input;
}

export interface NewSession {
	/** Goes to the browser in the cookie, once. Never store it. */
	readonly token: string;
	/** Store this: the session's key in your table. */
	readonly tokenHash: string;
	/** Epoch ms when the session ends, from the absolute policy. */
	readonly expiresAt: number;
}

/** A stored session, as your lookup returns it. */
export interface SessionRecord<User> {
	readonly user: User;
	/** Epoch ms. */
	readonly expiresAt: number;
	/** Epoch ms of the last use; the idle timeout counts from here. */
	readonly lastSeenAt: number;
}

export interface SessionAuthOptions<User, E, R> {
	/** Finds a session by token hash, e.g. a query on your sessions table. */
	readonly lookup: (tokenHash: string) => Effect.Effect<Option.Option<SessionRecord<User>>, E, R>;
	/**
	 * Saves a new `lastSeenAt`, so the idle timeout slides. Called at most once an
	 * hour per session. Without it, idle time counts from sign-in.
	 */
	readonly touch?: (tokenHash: string, lastSeenAt: number) => Effect.Effect<void, E, R>;
	/** Cookie name. Default `session`. */
	readonly cookie?: string;
	readonly policy?: SessionPolicy;
	/** Set `false` only for local development over plain http. Default `true`. */
	readonly secure?: boolean;
}

const millis = (input: Duration.Input | undefined, fallback: Duration.Duration) =>
	Duration.toMillis(input === undefined ? fallback : Duration.fromInputUnsafe(input));

/** SHA-256 of a token, base64url. `undefined` when the token isn't one of ours. */
export const hashSessionToken = (token: string): Effect.Effect<string | undefined> => {
	const bytes = fromBase64Url(token);
	if (!bytes || bytes.length !== TOKEN_BYTES) return Effect.succeed(undefined);
	return Effect.promise(() => crypto.subtle.digest("SHA-256", new Uint8Array(bytes))).pipe(
		Effect.map((digest) => toBase64Url(new Uint8Array(digest))),
	);
};

/**
 * Builds session auth for an app. Tokens are 256 random bits; only their hash
 * is stored, so a leaked table can't sign anyone in. The cookie is HttpOnly,
 * Secure and SameSite=Lax.
 *
 * ```ts
 * // lib/auth.ts
 * export const auth = sessionAuth({
 *   lookup: (tokenHash) => MainDb.findSession({ tokenHash }),
 *   touch: (tokenHash, lastSeenAt) => MainDb.touchSession({ tokenHash, lastSeenAt }),
 * });
 * // in a handler
 * const user = yield* auth.requireUser;
 * ```
 */
export const sessionAuth = <User, E = never, R = never>(
	options: SessionAuthOptions<User, E, R>,
) => {
	const name = options.cookie ?? "session";
	const absolute = millis(options.policy?.absolute, Duration.days(30));
	const idle = millis(options.policy?.idle, Duration.days(7));
	const secure = options.secure ?? true;
	// One lookup per request, however many handlers or loaders ask.
	const resolved = new WeakMap<HttpServerRequest.HttpServerRequest, Option.Option<User>>();

	const resolve = Effect.gen(function* () {
		const token = (yield* HttpServerRequest.HttpServerRequest).cookies[name];
		if (!token) return Option.none<User>();
		const tokenHash = yield* hashSessionToken(token);
		if (!tokenHash) return Option.none<User>();
		const found = yield* options.lookup(tokenHash);
		if (Option.isNone(found)) return Option.none<User>();
		const session = found.value;
		const now = yield* Clock.currentTimeMillis;
		if (now >= session.expiresAt || now - session.lastSeenAt >= idle) return Option.none<User>();
		if (options.touch && now - session.lastSeenAt >= Duration.toMillis(TOUCH_AFTER))
			yield* options.touch(tokenHash, now);
		return Option.some(session.user);
	});

	/** The signed-in user, if any. An absent, unknown or expired session is `None`. */
	const user: Effect.Effect<
		Option.Option<User>,
		E,
		R | HttpServerRequest.HttpServerRequest
	> = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const cached = resolved.get(request);
		if (cached) return cached;
		const found = yield* resolve;
		resolved.set(request, found);
		return found;
	});

	/** The signed-in user, or a 401. */
	const requireUser: Effect.Effect<
		User,
		E | Unauthorized,
		R | HttpServerRequest.HttpServerRequest
	> = Effect.flatMap(user, (found) =>
		Option.match(found, {
			onNone: () => Effect.fail(new Unauthorized({ message: "Sign in first" })),
			onSome: Effect.succeed,
		}),
	);

	/** A new session: store `tokenHash` and `expiresAt`, then answer with `signIn(response, token)`. */
	const create: Effect.Effect<NewSession> = Effect.gen(function* () {
		const token = toBase64Url(randomBytes(TOKEN_BYTES));
		const tokenHash = (yield* hashSessionToken(token)) as string;
		return { token, tokenHash, expiresAt: (yield* Clock.currentTimeMillis) + absolute };
	});

	/** Sets the session cookie on a response. */
	const signIn = (response: HttpServerResponse.HttpServerResponse, token: string) =>
		HttpServerResponse.setCookieUnsafe(response, name, token, {
			path: "/",
			httpOnly: true,
			secure,
			sameSite: "lax",
			maxAge: Duration.millis(absolute),
		});

	/** Clears the session cookie. Delete the stored session too. */
	const signOut = (response: HttpServerResponse.HttpServerResponse) =>
		HttpServerResponse.expireCookieUnsafe(response, name, {
			path: "/",
			httpOnly: true,
			secure,
			sameSite: "lax",
		});

	/** The token hash of the request's session cookie, to delete its row on sign-out. */
	const currentTokenHash: Effect.Effect<
		string | undefined,
		never,
		HttpServerRequest.HttpServerRequest
	> = Effect.gen(function* () {
		const token = (yield* HttpServerRequest.HttpServerRequest).cookies[name];
		return token ? yield* hashSessionToken(token) : undefined;
	});

	return { user, requireUser, create, signIn, signOut, currentTokenHash } as const;
};

export type SessionAuth<User, E = never, R = never> = ReturnType<typeof sessionAuth<User, E, R>>;
