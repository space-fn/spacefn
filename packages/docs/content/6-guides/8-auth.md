---
icon: lock
---

# Auth

spacefn gives building blocks, not a user system: your users and sessions live in your own tables, and you decide the flows. All of it runs on Workers and Bun alike.

## Passwords

```ts
const hash = yield * Password.hash(password); // fails with WeakPassword under 12 characters
const { valid, needsRehash } = yield * Password.verify(password, user.passwordHash);
```

PBKDF2-SHA256 at 100,000 iterations, the most Workers allow. That is below OWASP's advice, so rate-limit sign-in (below). The stored hash records its parameters, so they can change later without breaking old hashes; `needsRehash` says when to store a new one. Both take a `pepper`, a secret from your env mixed in so a stolen database alone can't be brute-forced.

## Sessions

`sessionAuth` gives cookie sessions over your own sessions table. Only a hash of each token is stored, so a leaked table signs nobody in.

```ts [modules/accounts/sessions.ts]
import { sessionAuth } from "spacefn";

import MainDb from "#space/db/main.ts";

export const auth = sessionAuth({
	lookup: (tokenHash) => MainDb.findSession({ tokenHash }),
	touch: (tokenHash, lastSeenAt) => MainDb.touchSession({ tokenHash, lastSeenAt }),
	policy: { absolute: "30 days", idle: "7 days" },
});
```

`lookup` returns `Option<{ user, expiresAt, lastSeenAt }>`. Then:

- `auth.user`: the signed-in user as an `Option`, looked up once per request.
- `auth.requireUser`: the user, or a `401`.
- `auth.create`: a new session. Store its `tokenHash` and `expiresAt`, then answer with `auth.signIn(response, session.token)`.
- `auth.signOut(response)`: clears the cookie. Delete the row too.

The cookie is HttpOnly, Secure and SameSite=Lax, named `session` unless you set `cookie`. Pass the name to `csrf({ cookie: "session" })` too. Set `secure: false` only for plain-http local dev.

## Rate limiting

```ts
yield * rateLimit(`sign-in:${email}`, { limit: 5, window: "15 minutes" });
yield * rateLimit(`sign-in:${yield * clientAddress}`, { limit: 20, window: "15 minutes" });
```

Past the limit it fails with `TooManyRequests`, a `429` with `Retry-After`. Limit by what you protect: the account and the address. See [Services](6-services.md).

## Two-factor codes (TOTP)

```ts
const secret = Totp.newSecret(); // store it as a secret
const qr = Totp.uri({ secret, issuer: "Todo", account: user.email }); // show as a QR code
const check = yield * Totp.verify(code, secret, { afterStep: user.lastTotpStep }); // { valid, step }
```

Codes from authenticator apps (RFC 6238). `verify` accepts a step either side for clock drift and refuses steps at or before `afterStep`, so store the `step` it returns and a code can't be used twice.

## Signed tokens

For links in emails: verification, password reset, invites.

```ts
const token =
	yield * SignedToken.sign({ purpose: "reset", subject: user.id }, env.TOKEN_SECRET, "1 hour");
const claims = yield * SignedToken.verify(token, env.TOKEN_SECRET, "reset"); // fails with InvalidToken
```

HMAC-signed, with a purpose, an expiry and a unique `jti` you can record to make a link single-use.

## Sign in with Google, GitHub or Facebook

```ts [modules/accounts/google.ts]
import { Effect } from "effect";
import { OAuth, redirect } from "spacefn";

import Env from "#configs/env.ts";

import { auth } from "./sessions.ts";

const google = Effect.map(Env, (env) =>
	OAuth.google({
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
		redirectUri: `${env.ORIGIN}/auth/google`,
	}),
);

/** Sends the browser to Google, or, on its way back, signs the user in. */
export const signIn = Effect.gen(function* () {
	const provider = yield* google;
	if (!(yield* provider.isCallback)) return yield* provider.start;
	const profile = yield* provider.finish; // { provider, id, email, emailVerified, name, avatarUrl }
	// find or create the user by profile.provider + profile.id, then:
	const session = yield* auth.create;
	return provider.clear(auth.signIn(redirect("/"), session.token));
});
```

```ts [app/routes/auth/google.ts]
import { route } from "spacefn";

import { signIn } from "#modules/accounts/google.ts";

export default route({ GET: signIn });
```

The code flow with PKCE and a state cookie, so a callback only completes a sign-in this browser started. `OAuth.github` and `OAuth.facebook` work the same, and `oauthProvider(spec, client)` builds others. Match existing accounts by email only when `emailVerified` is true; Facebook never says so.
