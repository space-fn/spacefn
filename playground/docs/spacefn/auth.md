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

- The browser gets a random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The database stores only its SHA-256 hash, so a leaked table cannot be replayed.
- A session ends at its absolute expiry (30 days by default) or after 7 days idle. `isSessionActive` checks both.
- `sessionResolver({ lookup })` reads the cookie and sets `c.get("user")`. An unknown or expired session leaves the user unset and does not refuse the request.
- `requireSession()` refuses requests without a user, with 401.
- `clearSessionCookie()` for sign-out. Also delete the session row.
- The idle clock slides through `touch`: when `lastSeenAt` is over an hour old, `sessionResolver({ lookup, touch })` calls `touch` to write a fresh one. That is one write per hour at most, not one per request. Without `touch`, the idle clock runs from the last write, which is usually the sign-in.

## Cross-site request guard

```ts
import { csrfGuard } from "spacefn/auth";

app.use(csrfGuard({ cookie: "session", origins: ["https://app.example.com"] }));
```

- For `POST`, `PUT`, `PATCH` and `DELETE`, the `Origin` header must be this app's own origin or one you list — with or without a session cookie. Checking cookie-less requests too is what stops a forged login.
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

## Playground

The template runs these together: sign-up, sign-in with rate limiting, a session cookie, `/auth/me`, sign-out, and a cross-site guard on writes. It is verified in `workerd` through `vite dev`.

- `app/middleware/03-session.ts` attaches the user to every request.
- `app/middleware/04-csrf.ts` guards writes that carry a session.
- `app/middleware/05-login-limit.ts` limits sign-in attempts.
- `app/routes/auth/*` are the handlers.

The template does not use TOTP or signed tokens, and the library tests cover them.

## Not built

- User management, roles and permissions.
- Email verification and password reset flows.
- OAuth and social sign-in.
- Used-token storage for signed tokens.
- A Durable Object rate-limit store. The interface is ready; the object is for your app to write.
- Encryption of stored secrets.
