# Auth

spacefn ships the parts of authentication that are easy to get wrong, and leaves the rest to your app. There are no user tables, roles or sign-in pages in the library. You own the schema, the SQL and the flows, as with the rest of spacefn.

Import from `spacefn/auth`.

## Password hashing

```ts
import { hashPassword, hibpBreachCheck, verifyPassword } from "spacefn/auth";

const stored = await hashPassword(password, {
	pepper: c.env.PASSWORD_PEPPER,
	breachCheck: hibpBreachCheck(),
});
const { valid, needsRehash } = await verifyPassword(input, stored, {
	pepper: c.env.PASSWORD_PEPPER,
});
```

- PBKDF2-HMAC-SHA256 through Web Crypto, 16-byte random salt, 32-byte key.
- The hash records its own parameters: `pbkdf2-sha256$<iterations>$<salt>$<hash>`. Old hashes keep working when the count changes.
- `verifyPassword` compares in constant time. A malformed stored hash throws, so a corrupted row cannot pass as a wrong password.
- `needsRehash` is true when a hash used fewer iterations than the target. Re-hash it on the next successful sign-in.
- Passwords must be 12 to 1024 characters. `hashPassword` refuses shorter ones; `verifyPassword` does not, so passwords set before a policy change still sign in.
- A `pepper` is a server-side secret mixed into the derivation before PBKDF2. Keep it outside the database, as an env secret: a stolen database alone then cannot be brute-forced. Hash and verify must use the same value, so changing it makes every stored hash unverifiable.

## Password pepper in detail

### What it does

The pepper is mixed in **before** PBKDF2, as an HMAC-SHA256 keyed by the pepper:

```ts
// inside derive()
let input = new TextEncoder().encode(password);
if (pepper !== undefined) {
	const pepperKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(pepper),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	input = await crypto.subtle.sign("HMAC", pepperKey, input); // 32 bytes
}
// PBKDF2 then runs on `input`, not on the raw password
```

So the value fed to PBKDF2 is `HMAC-SHA256(pepper, password)`. The salt and iteration count stay the same; only the input changes. The stored hash format (`pbkdf2-sha256$<iterations>$<salt>$<hash>`) does **not** record whether a pepper was used or which one. The pepper lives only in the Worker's environment.

### Why it helps

PBKDF2 on Workers is capped at 100,000 iterations, well below OWASP's 600,000 recommendation. The pepper is the compensating control:

- A stolen database gives an attacker salt, iteration count and hash, but not the pepper. Without the pepper they cannot run PBKDF2 at all, so no offline brute force is possible.
- The pepper is a single high-entropy secret (not a per-user value), so it adds a global barrier rather than per-row work.
- It is independent of the iteration cap: it protects even if the cap drops further.

It does not replace iterations. Keep both: a high-entropy pepper plus the maximum allowed iteration count.

### Operational rules

- **Same value everywhere.** `hashPassword` and `verifyPassword` must receive the same `pepper`. In practice, read it once from `c.env.PASSWORD_PEPPER` and pass it to both calls. A mismatch silently makes every password verify as wrong.
- **Keep it out of the database.** Store it as a Cloudflare secret (`wrangler secret put PASSWORD_PEPPER`), never in D1, KV, or source. A `secret()` field in `app/env.ts` is the right shape.
- **Rotate with a plan.** Changing the pepper invalidates every stored hash, because the input to PBKDF2 changes. There is no migration path: either re-hash on next sign-in (you cannot, because verification fails first) or force a password reset for all users. Pick the pepper before storing real passwords, and treat rotation as an incident, not a routine.
- **Length.** Any string works (it is UTF-8 encoded into the HMAC key), but use a long random value, for example 32 bytes base64-encoded. Short or guessable peppers defeat the purpose.
- **Do not reuse it.** Generate a pepper dedicated to password hashing. Do not reuse the session cookie secret, the token signing key, or the CSRF key.

### Verifying a pepper is wired correctly

A quick check: hash a password with the pepper, then verify it with the same pepper and confirm `valid` is true; verify the same stored hash with a different pepper and confirm `valid` is false. If both pass with the wrong pepper, the pepper is not actually being applied.

- A `breachCheck` refuses passwords found in a breach corpus. `hibpBreachCheck()` uses the Have I Been Pwned range API with k-anonymity: only the first five hex characters of the password's SHA-1 leave the Worker. A failed request lets the password through, so the API being down does not block sign-ups.

### The iteration limit

**The production iteration limit is 100,000.** Higher counts are rejected at run time by Cloudflare's runtime with `NotSupportedError`. OWASP currently recommends 600,000 for PBKDF2-HMAC-SHA256, so spacefn's default is below that recommendation.

- The library refuses any count above 100,000, so a hash that production cannot verify is never written.
- Local `workerd` (`vite dev`) does not enforce the limit. A count of 600,000 works in development and fails in production. The library's check is what stops that mismatch.
- The pepper is what closes the gap: it is a second secret no database dump contains. With a 12-character minimum and a breached-password check on top, the capped iteration count matters far less.
- If your threat model needs more than 100,000 iterations, PBKDF2 on Workers cannot give it today. Options are an external service, or a memory-hard algorithm in pure JavaScript, which needs a paid CPU budget. Decide this before storing real passwords.

## Sessions

```ts
import { newSession, sessionCookie, hashSessionToken, readCookie } from "spacefn/auth";

const session = await newSession();
// store only the hash
await db.addSession({ tokenHash: session.tokenHash, userId, expiresAt, lastSeenAt });
c.header("Set-Cookie", sessionCookie(session.token));
```

For a normal session flow, put the resolver before routes and require a user on
protected routes:

```ts
import { requireSession, sessionResolver } from "spacefn/auth";

app.use(
	sessionResolver({
		lookup: (env, tokenHash) => findSessionAndUser(env.DB, tokenHash),
		touch: (env, tokenHash, lastSeenAt) => touchSession(env.DB, tokenHash, lastSeenAt),
	}),
);

app.get("/account", requireSession(), (c) => c.json({ user: c.get("user") }));
```

`findSessionAndUser` and `touchSession` are app-owned database functions. The
middleware hashes the cookie token before calling `lookup`; persist only
`tokenHash`, never the browser token.

- The browser gets a random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The database stores only its SHA-256 hash, so a leaked table cannot be replayed.
- A session ends at the `expiresAt` value you store or after 7 days idle by default. `isSessionActive` checks both; set `expiresAt` when creating the row, commonly 30 days after sign-in.
- `sessionResolver({ lookup })` reads the cookie and sets `c.get("user")`. An unknown or expired session leaves the user unset and does not refuse the request.
- `requireSession()` refuses requests without a user, with 401.
- `clearSessionCookie()` for sign-out. Also delete the session row. The helper always sets `Secure`; local plain-HTTP development needs a matching cookie-clearing header without `Secure`.
- The idle clock slides through `touch`: when `lastSeenAt` is over an hour old, `sessionResolver({ lookup, touch })` calls `touch` to write a fresh one. That is one write per hour at most, not one per request. Without `touch`, the idle clock runs from the last write, which is usually the sign-in.

## Cross-site request guard

```ts
import { csrfGuard } from "spacefn/auth";

app.use(csrfGuard({ cookie: "session", origins: ["https://app.example.com"] }));
```

Register it before state-changing routes. This is an origin check, not an
authorization check; protected handlers still need `requireSession()` and
resource-level permission checks.

- For `POST`, `PUT`, `PATCH` and `DELETE`, the `Origin` header must be this app's own origin or one you list - with or without a session cookie. Checking cookie-less requests too is what stops a forged login.
- Without an `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
- A request with neither header is refused when it carries a session cookie, and allowed when it does not, so non-browser API clients keep working.

## Rate limiting

```ts
import { clientKey, memoryRateStore, rateLimit } from "spacefn/auth";

app.use(rateLimit({ store: memoryRateStore(), limit: 5, windowMs: 60_000 }));
```

- Answers 429 with `Retry-After`.
- The default key is `cf-connecting-ip`. Pass your own `key` to count per account, or per account and IP.
- **`memoryRateStore` counts per isolate.** That is fine for development. A production deployment has many isolates, so the count must live in one place: a Durable Object. Implement `RateStore.hit` against a Durable Object. Do not use KV, which is eventually consistent.

## TOTP (authenticator apps)

```ts
import { newTotpSecret, otpauthUri, verifyTotp } from "spacefn/auth";

const secret = newTotpSecret(); // store encrypted
const uri = otpauthUri({ secret, issuer: "Space App", account: user.email }); // show as a QR code

const verdict = await verifyTotp(code, secret, Date.now(), { afterStep: user.lastTotpStep });
if (verdict.valid) await saveLastStep(user.id, verdict.step);
```

- RFC 6238: HMAC-SHA1, 30-second steps, six digits. Checked against the RFC's published test vectors.
- Accepts one step of clock drift either way.
- Pass the last accepted step as `afterStep`, and store the returned `step`. A code then works once.
- The secret is a credential. Encrypt it at rest; the library does not.

## Signed one-time tokens

```ts
import { signToken, verifyToken } from "spacefn/auth";

const token = await signToken(
	{ purpose: "invite", subject: tenantId },
	env.TOKEN_KEY,
	7 * 24 * 60 * 60 * 1000, // 7 days, in milliseconds
	Date.now(),
);
const claims = await verifyToken(token, env.TOKEN_KEY, "invite", Date.now());
```

- HMAC-SHA256 over a JSON payload with `purpose`, `subject`, `jti` and `expiresAt`.
- The key must be at least 32 characters. Store it as a secret.
- `verifyToken` checks the signature first, then the purpose and expiry.
- **A signed token is reusable until it expires.** To make it single-use (for password reset, for example), record `claims.jti` when you use it, and refuse a `jti` you have seen. The library does not store used ids.

The template does not use TOTP or signed tokens, and the library tests cover them.

## Not built

- User management, roles and permissions.
- Email verification and password reset flows.
- OAuth and social sign-in.
- Used-token storage for signed tokens.
- A Durable Object rate-limit store. The interface is ready; the object is for your app to write.
- Encryption of stored secrets.
