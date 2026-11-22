import { Duration, Effect, Redacted, Schema } from "effect";
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";

import { constantTimeEqual, randomBytes, toBase64Url } from "./encoding.ts";

/** Who signed in, the same shape for every provider. */
export interface OAuthProfile {
	readonly provider: string;
	/** The provider's stable user id. Link accounts by `provider` + `id`, not by email. */
	readonly id: string;
	readonly email: string | undefined;
	/** Whether the provider vouches for the email. Only then is it safe to match an existing account by email. */
	readonly emailVerified: boolean;
	readonly name: string | undefined;
	readonly avatarUrl: string | undefined;
}

export class OAuthError extends Schema.TaggedError<OAuthError>()("OAuthError", {
	provider: Schema.String,
	/**
	 * `denied`: the user cancelled. `state`: the callback doesn't belong to a
	 * sign-in this browser started (expired, replayed or forged). `exchange` and
	 * `profile`: the provider refused or failed.
	 */
	reason: Schema.Literals(["denied", "state", "exchange", "profile"]),
	message: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}

export interface OAuthClient {
	readonly clientId: string;
	readonly clientSecret: Redacted.Redacted<string> | string;
	/** The absolute callback URL registered with the provider. */
	readonly redirectUri: string;
	/** Extra scopes beyond the defaults (identity and email). */
	readonly scopes?: readonly string[];
	/** Set `false` only for local development over plain http. Default `true`. */
	readonly secure?: boolean;
}

/** How a provider works: where to send the user, where to trade the code, and how to read the profile. */
export interface OAuthProviderSpec {
	readonly name: string;
	readonly authorizeUrl: string;
	readonly tokenUrl: string;
	readonly scopes: readonly string[];
	/** Extra authorize parameters. */
	readonly authorizeParams?: Readonly<Record<string, string>>;
	readonly profile: (
		accessToken: string,
	) => Effect.Effect<Omit<OAuthProfile, "provider">, unknown, HttpClient.HttpClient>;
}

const reveal = (secret: Redacted.Redacted<string> | string) =>
	Redacted.isRedacted(secret) ? Redacted.value(secret) : secret;

const sha256 = (text: string) =>
	Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).pipe(
		Effect.map((digest) => toBase64Url(new Uint8Array(digest))),
	);

const TokenResponse = Schema.Struct({ access_token: Schema.String });

const getJson = <S extends Schema.Top>(url: string, accessToken: string, schema: S) =>
	Effect.flatMap(HttpClient.HttpClient, (client) =>
		client
			.execute(
				HttpClientRequest.get(url).pipe(
					HttpClientRequest.bearerToken(accessToken),
					HttpClientRequest.acceptJson,
					HttpClientRequest.setHeader("user-agent", "spacefn"),
				),
			)
			.pipe(
				Effect.flatMap(HttpClientResponse.filterStatusOk),
				Effect.flatMap(HttpClientResponse.schemaBodyJson(schema as never)),
			),
	) as Effect.Effect<Schema.Schema.Type<S>, unknown, HttpClient.HttpClient>;

/**
 * An OAuth 2 sign-in with a provider: authorization code flow with PKCE, and
 * a `state` checked against an HttpOnly cookie, so a callback only completes
 * the sign-in this browser started.
 *
 * ```ts
 * const google = OAuth.google({ clientId, clientSecret, redirectUri: "https://app.example/auth/google" });
 * // app/routes/auth/google.ts
 * export default route({
 *   GET: Effect.gen(function* () {
 *     if (!(yield* google.isCallback)) return yield* google.start;
 *     const profile = yield* google.finish;
 *     // find or create the user by profile.provider + profile.id, then create a session
 *     return google.clear(auth.signIn(redirect("/"), session.token));
 *   }),
 * });
 * ```
 */
export const oauthProvider = (spec: OAuthProviderSpec, client: OAuthClient) => {
	const cookie = `oauth_${spec.name}`;
	const secure = client.secure ?? true;
	const fail = (reason: OAuthError["reason"], message: string, cause?: unknown) =>
		new OAuthError({
			provider: spec.name,
			reason,
			message,
			...(cause === undefined ? {} : { cause }),
		});

	/** A redirect to the provider, remembering `state` and the PKCE verifier in a 10-minute cookie. */
	const start: Effect.Effect<HttpServerResponse.HttpServerResponse> = Effect.gen(function* () {
		const state = toBase64Url(randomBytes(16));
		const verifier = toBase64Url(randomBytes(32));
		const url = new URL(spec.authorizeUrl);
		const params = {
			response_type: "code",
			client_id: client.clientId,
			redirect_uri: client.redirectUri,
			scope: [...spec.scopes, ...(client.scopes ?? [])].join(" "),
			state,
			code_challenge: yield* sha256(verifier),
			code_challenge_method: "S256",
			...spec.authorizeParams,
		};
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
		return HttpServerResponse.setCookieUnsafe(
			HttpServerResponse.redirect(url.toString(), { status: 302 }),
			cookie,
			`${state}.${verifier}`,
			{
				path: "/",
				httpOnly: true,
				secure,
				sameSite: "lax",
				maxAge: Duration.minutes(10),
			},
		);
	});

	/** Whether this request is the provider's redirect back (it carries `code`, `state` or `error`). */
	const isCallback: Effect.Effect<boolean, never, HttpServerRequest.HttpServerRequest> = Effect.gen(
		function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const query = new URL(request.originalUrl, "http://x").searchParams;
			return query.has("code") || query.has("error") || query.has("state");
		},
	);

	/** Checks the callback against the cookie, trades the code for a token, and reads the profile. */
	const finish: Effect.Effect<
		OAuthProfile,
		OAuthError,
		HttpServerRequest.HttpServerRequest | HttpClient.HttpClient
	> = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const query = new URL(request.originalUrl, "http://x").searchParams;
		if (query.get("error"))
			return yield* fail("denied", query.get("error_description") ?? "The sign-in was cancelled");
		const [expectedState, verifier] = (request.cookies[cookie] ?? "").split(".");
		const state = query.get("state") ?? "";
		const code = query.get("code");
		const encode = (text: string) => new TextEncoder().encode(text);
		if (
			!expectedState ||
			!verifier ||
			!code ||
			!constantTimeEqual(encode(state), encode(expectedState))
		)
			return yield* fail("state", "This sign-in link expired or wasn't started here. Try again");

		const http = yield* HttpClient.HttpClient;
		const token = yield* http
			.execute(
				HttpClientRequest.post(spec.tokenUrl).pipe(
					HttpClientRequest.acceptJson,
					HttpClientRequest.bodyUrlParams({
						grant_type: "authorization_code",
						code,
						redirect_uri: client.redirectUri,
						client_id: client.clientId,
						client_secret: reveal(client.clientSecret),
						code_verifier: verifier,
					}),
				),
			)
			.pipe(
				Effect.flatMap(HttpClientResponse.filterStatusOk),
				Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
				Effect.mapError((cause) =>
					fail("exchange", "The provider refused the sign-in code", cause),
				),
			);
		const profile = yield* spec
			.profile(token.access_token)
			.pipe(Effect.mapError((cause) => fail("profile", "Couldn't read the profile", cause)));
		return { provider: spec.name, ...profile };
	});

	/** Removes the state cookie; call it on the response that ends the sign-in. */
	const clear = (response: HttpServerResponse.HttpServerResponse) =>
		HttpServerResponse.expireCookieUnsafe(response, cookie, {
			path: "/",
			httpOnly: true,
			secure,
			sameSite: "lax",
		});

	return { name: spec.name, start, isCallback, finish, clear } as const;
};

export type OAuthProvider = ReturnType<typeof oauthProvider>;

const optional = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema));
const orUndefined = <A>(value: A | null | undefined) => value ?? undefined;

const GoogleUser = Schema.Struct({
	sub: Schema.String,
	email: optional(Schema.String),
	email_verified: optional(Schema.Boolean),
	name: optional(Schema.String),
	picture: optional(Schema.String),
});

/** Google sign-in (OpenID Connect userinfo). */
const google = (client: OAuthClient) =>
	oauthProvider(
		{
			name: "google",
			authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
			tokenUrl: "https://oauth2.googleapis.com/token",
			scopes: ["openid", "email", "profile"],
			profile: (accessToken) =>
				Effect.map(
					getJson("https://openidconnect.googleapis.com/v1/userinfo", accessToken, GoogleUser),
					(u) => ({
						id: u.sub,
						email: orUndefined(u.email),
						emailVerified: u.email_verified === true,
						name: orUndefined(u.name),
						avatarUrl: orUndefined(u.picture),
					}),
				),
		},
		client,
	);

const GitHubUser = Schema.Struct({
	id: Schema.Number,
	login: Schema.String,
	name: optional(Schema.String),
	avatar_url: optional(Schema.String),
});
const GitHubEmails = Schema.Array(
	Schema.Struct({ email: Schema.String, primary: Schema.Boolean, verified: Schema.Boolean }),
);

/** GitHub sign-in. The email is the primary address from `/user/emails`, with its verified flag. */
const github = (client: OAuthClient) =>
	oauthProvider(
		{
			name: "github",
			authorizeUrl: "https://github.com/login/oauth/authorize",
			tokenUrl: "https://github.com/login/oauth/access_token",
			scopes: ["read:user", "user:email"],
			profile: (accessToken) =>
				Effect.gen(function* () {
					const user = yield* getJson("https://api.github.com/user", accessToken, GitHubUser);
					const emails = yield* getJson(
						"https://api.github.com/user/emails",
						accessToken,
						GitHubEmails,
					);
					const primary = emails.find((e) => e.primary);
					return {
						id: String(user.id),
						email: primary?.email,
						emailVerified: primary?.verified === true,
						name: orUndefined(user.name) ?? user.login,
						avatarUrl: orUndefined(user.avatar_url),
					};
				}),
		},
		client,
	);

const FacebookUser = Schema.Struct({
	id: Schema.String,
	name: optional(Schema.String),
	email: optional(Schema.String),
	picture: optional(Schema.Struct({ data: Schema.Struct({ url: Schema.String }) })),
});

/**
 * Facebook sign-in through the Graph API (`graphVersion`, default `v23.0`).
 * Facebook doesn't say whether the email is verified, so `emailVerified` is
 * `false`: don't match existing accounts by a Facebook email.
 */
const facebook = (client: OAuthClient & { readonly graphVersion?: string }) => {
	const version = client.graphVersion ?? "v23.0";
	return oauthProvider(
		{
			name: "facebook",
			authorizeUrl: `https://www.facebook.com/${version}/dialog/oauth`,
			tokenUrl: `https://graph.facebook.com/${version}/oauth/access_token`,
			scopes: ["public_profile", "email"],
			profile: (accessToken) =>
				Effect.map(
					getJson(
						`https://graph.facebook.com/${version}/me?fields=id,name,email,picture`,
						accessToken,
						FacebookUser,
					),
					(u) => ({
						id: u.id,
						email: orUndefined(u.email),
						emailVerified: false,
						name: orUndefined(u.name),
						avatarUrl: u.picture?.data.url,
					}),
				),
		},
		client,
	);
};

/** Sign-in with Google, GitHub and Facebook. `oauthProvider` builds others. */
export const OAuth = { google, github, facebook } as const;
