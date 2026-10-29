# Authentication API (`spacefn/auth`)

These are composable primitives, not a complete account system. The app owns
user records, persistence, delivery, and route policy. See the
[authentication guide](../guides/auth.md) for a complete flow and security
trade-offs.

## Passwords

```ts
import { hashPassword, verifyPassword } from "spacefn/auth";

const hash = await hashPassword(password, { pepper: env.PASSWORD_PEPPER });
const result = await verifyPassword(password, hash, { pepper: env.PASSWORD_PEPPER });
if (result.valid && result.needsRehash) {
	// Rehash and replace the stored value.
}
```

| API                                          | Behavior                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `hashPassword(password, options?)`           | PBKDF2-SHA-256 hash in a self-describing format; enforces the 12-character minimum.                                         |
| `verifyPassword(password, stored, options?)` | Checks the stored hash and returns `{ valid, needsRehash }`.                                                                |
| `hibpBreachCheck(fetchImpl?)`                | Have I Been Pwned range check; sends only the first five SHA-1 hex characters and fails open if the service is unavailable. |

`HashOptions` supports `iterations`, `pepper`, and `breachCheck`.
`MAX_ITERATIONS` is the Workers runtime cap (100,000), below OWASP's current
recommendation; `MIN_PASSWORD_LENGTH` is 12 and `MAX_PASSWORD_LENGTH` is 1024.
The auth guide documents the implications and alternatives.

## Sessions and cookies

`newSession()` returns a random `token` for the cookie and `tokenHash` for
storage. Persist only the hash. `hashSessionToken(token)` computes that hash.
`sessionResolver(options)` looks up the hash, validates expiry, and sets
`c.get("user")` when valid; missing or expired sessions continue anonymously.
`requireSession()` returns 401 when no user is set. Both are Hono middleware.

`SessionOptions<Env, User>` contains `lookup(env, tokenHash)`, optional
`touch(env, tokenHash, lastSeenAt)`, `cookie`, and `policy`. `touch` refreshes
`lastSeenAt` at most hourly. `SessionRecord` has `expiresAt` and `lastSeenAt` in
epoch milliseconds. `SessionPolicy` has `absoluteMs` and `idleMs`;
`DEFAULT_SESSION_POLICY` is 30 days absolute and 7 days idle.
`isSessionActive(record, now, policy?)` checks both limits.

`sessionCookie(token, options?)` returns a `Set-Cookie` value with HttpOnly,
SameSite=Lax, Secure, and Path=/ by default. `CookieOptions` can change its
name, max age, or secure flag. `clearSessionCookie(name?)` clears the cookie;
`readCookie(header, name?)` reads one named cookie. `NewSession` describes the
result of `newSession()`.

## Request protections

| API                                                  | Behavior                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `csrfGuard(options?)`                                | Hono middleware that refuses cross-site state changes with 403. Safe methods pass through. |
| `isSameSiteRequest(headers, requestOrigin, allowed)` | Checks Origin or `Sec-Fetch-Site` against the request origin and allowlist.                |
| `rateLimit(options)`                                 | Hono middleware returning 429 and `Retry-After` above a fixed-window limit.                |
| `clientKey(c)`                                       | Uses `cf-connecting-ip`, or `"unknown"` when absent.                                       |
| `memoryRateStore()`                                  | In-memory fixed-window store for tests/development only, not shared across isolates.       |

`CsrfOptions` accepts `origins` and `cookie`. Browser requests with Origin or
Sec-Fetch-Site signals must be same-site even when unauthenticated, preventing
login CSRF. Requests with no browser signals pass only when they have no session
cookie.

`RateLimitOptions` requires a consistent `RateStore`, `limit`, and `windowMs`;
`key(c)` optionally overrides IP-based grouping. Use a single-source-of-truth
store such as a Durable Object in production, not KV.

## TOTP and signed tokens

`newTotpSecret()` creates a base32-encoded 160-bit secret. `otpauthUri({
secret, issuer, account })` creates the authenticator enrollment URI.
`totpAt(secret, atMs)` computes a six-digit, 30-second code.
`verifyTotp(code, secret, atMs, { window?, afterStep? })` allows one time step
of clock drift by default and can reject replayed steps. Persist the returned
`step` and pass it as `afterStep` next time. `base32Encode` and `base32Decode`
convert secrets; `TotpVerdict` is `{ valid: boolean; step?: number }`.

`signToken({ purpose, subject }, secret, ttlMs, now)` issues a signed token with
a random `jti` and expiry. `verifyToken(token, secret, purpose, now)` checks the
signature, purpose, and expiry, returning `TokenPayload`; it does not persist or
enforce one-time use of `jti`. Use a key of at least 32 characters. Failures
throw `TokenError`.

`constantTimeEqual`, `toBase64Url`, and `fromBase64Url` are low-level encoding
helpers also exported from this module.
