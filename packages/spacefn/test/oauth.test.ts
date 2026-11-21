import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { toBase64Url } from "../src/auth/encoding.ts";
import { OAuth, type OAuthProvider } from "../src/auth/oauth.ts";
import { route } from "../src/http/route.ts";
import { testApp } from "../src/testing.ts";

const client = {
	clientId: "client-1",
	clientSecret: "secret-1",
	redirectUri: "https://app.test/auth/cb",
};

/** Plays the provider: answers the token and profile endpoints, and records every request. */
const fakeProvider = (responses: Record<string, unknown>, tokenStatus = 200) => {
	const sent: { url: string; body: string; auth: string | undefined }[] = [];
	const layer = Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((request, url) =>
			Effect.gen(function* () {
				const body =
					request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
				sent.push({ url: url.toString(), body, auth: request.headers.authorization });
				const isToken = url.pathname.includes("token");
				const json = isToken
					? { access_token: "access-1", token_type: "bearer" }
					: responses[url.origin + url.pathname];
				return HttpClientResponse.fromWeb(
					request,
					new Response(JSON.stringify(json ?? {}), {
						status: isToken ? tokenStatus : json ? 200 : 404,
						headers: { "content-type": "application/json" },
					}),
				);
			}),
		),
	);
	return { sent, layer };
};

const serve = (provider: OAuthProvider, services: Layer.Layer<any>) =>
	testApp(
		{
			routes: [
				{
					path: "/auth/cb",
					params: [],
					file: "app/routes/auth/cb.ts",
					module: {
						default: route({
							GET: Effect.gen(function* () {
								if (!(yield* provider.isCallback)) return yield* provider.start;
								return yield* provider.finish.pipe(
									Effect.catchTag("OAuthError", (error) => Effect.succeed({ error: error.reason })),
								);
							}),
						}),
					},
				},
			],
		},
		services,
	);

/** Starts a sign-in, then comes back from the provider with its code and state. */
const signIn = async (app: ReturnType<typeof serve>, tamper?: (state: string) => string) => {
	const start = await app.fetch("/auth/cb");
	const location = new URL(start.headers.get("location")!);
	const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0]!;
	const state = location.searchParams.get("state")!;
	const back = await app.fetch(`/auth/cb?code=code-1&state=${tamper ? tamper(state) : state}`, {
		headers: { cookie },
	});
	return { start, location, cookie, back: await back.json() };
};

describe("OAuth", () => {
	it("sends the user to the provider with state and a PKCE challenge", async () => {
		const { layer } = fakeProvider({});
		const app = serve(OAuth.google(client), layer);
		const { start, location, cookie } = await signIn(app);
		expect(start.status).toBe(302);
		expect(location.origin + location.pathname).toBe(
			"https://accounts.google.com/o/oauth2/v2/auth",
		);
		expect(Object.fromEntries(location.searchParams)).toMatchObject({
			response_type: "code",
			client_id: "client-1",
			redirect_uri: "https://app.test/auth/cb",
			scope: "openid email profile",
			code_challenge_method: "S256",
		});
		const [state, verifier] = cookie.replace("oauth_google=", "").split(".");
		expect(location.searchParams.get("state")).toBe(state);
		const challenge = toBase64Url(
			new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
		);
		expect(location.searchParams.get("code_challenge")).toBe(challenge);
		expect(start.headers.get("set-cookie")).toMatch(
			/Max-Age=600; Path=\/; HttpOnly; Secure; SameSite=Lax/,
		);
		await app.dispose();
	});

	it("trades the code with the verifier and reads a Google profile", async () => {
		const { sent, layer } = fakeProvider({
			"https://openidconnect.googleapis.com/v1/userinfo": {
				sub: "g-1",
				email: "ada@example.com",
				email_verified: true,
				name: "Ada",
				picture: "https://img/ada",
			},
		});
		const app = serve(OAuth.google(client), layer);
		const { cookie, back } = await signIn(app);
		expect(back).toEqual({
			provider: "google",
			id: "g-1",
			email: "ada@example.com",
			emailVerified: true,
			name: "Ada",
			avatarUrl: "https://img/ada",
		});
		const token = new URLSearchParams(sent[0]!.body);
		expect(Object.fromEntries(token)).toMatchObject({
			grant_type: "authorization_code",
			code: "code-1",
			client_secret: "secret-1",
			code_verifier: cookie.split(".")[1],
		});
		expect(sent[1]!.auth).toBe("Bearer access-1");
		await app.dispose();
	});

	it("reads GitHub's primary email with its verified flag", async () => {
		const { layer } = fakeProvider({
			"https://api.github.com/user": { id: 42, login: "ada", name: null, avatar_url: "https://a" },
			"https://api.github.com/user/emails": [
				{ email: "old@example.com", primary: false, verified: true },
				{ email: "ada@example.com", primary: true, verified: false },
			],
		});
		const app = serve(OAuth.github(client), layer);
		expect((await signIn(app)).back).toEqual({
			provider: "github",
			id: "42",
			email: "ada@example.com",
			emailVerified: false,
			name: "ada",
			avatarUrl: "https://a",
		});
		await app.dispose();
	});

	it("reads a Facebook profile and never claims the email is verified", async () => {
		const { layer } = fakeProvider({
			"https://graph.facebook.com/v23.0/me": {
				id: "f-1",
				name: "Ada",
				email: "ada@example.com",
				picture: { data: { url: "https://p" } },
			},
		});
		const app = serve(OAuth.facebook(client), layer);
		const { location, back } = await signIn(app);
		expect(location.origin + location.pathname).toBe("https://www.facebook.com/v23.0/dialog/oauth");
		expect(back).toMatchObject({
			provider: "facebook",
			id: "f-1",
			emailVerified: false,
			avatarUrl: "https://p",
		});
		await app.dispose();
	});

	it("refuses callbacks it didn't start, cancelled sign-ins and refused codes", async () => {
		const { layer } = fakeProvider({});
		const app = serve(OAuth.google(client), layer);
		expect((await signIn(app, (state) => `${state}x`)).back).toEqual({ error: "state" });
		expect(await (await app.fetch("/auth/cb?code=c&state=s")).json()).toEqual({ error: "state" });
		expect(await (await app.fetch("/auth/cb?error=access_denied")).json()).toEqual({
			error: "denied",
		});
		await app.dispose();

		const refusing = serve(OAuth.google(client), fakeProvider({}, 400).layer);
		expect((await signIn(refusing)).back).toEqual({ error: "exchange" });
		await refusing.dispose();
	});
});
