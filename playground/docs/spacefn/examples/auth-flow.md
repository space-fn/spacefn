# Auth flow

This example shows the framework primitives; the database functions and user
table are app-owned. Use a migration for the schema, parameterized queries,
rate-limit sign-in attempts, and validate request bodies before using them.

```ts
import { createUser } from "@modules/users";
import { hashPassword, hibpBreachCheck } from "spacefn/auth";
// app/routes/auth/signup.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email, password } = await c.req.json<{ email: string; password: string }>();
	const hash = await hashPassword(password, {
		pepper: c.env.PASSWORD_PEPPER,
		breachCheck: hibpBreachCheck(),
	});
	await createUser(c.env.DB, { email, passwordHash: hash });
	return { ok: true };
});
```

```ts
import { findUserByEmail, insertSession } from "@modules/users";
import { newSession, sessionCookie, verifyPassword } from "spacefn/auth";
// app/routes/auth/login.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email, password } = await c.req.json<{ email: string; password: string }>();
	const user = await findUserByEmail(c.env.DB, email);
	if (
		!user ||
		!(await verifyPassword(password, user.passwordHash, { pepper: c.env.PASSWORD_PEPPER })).valid
	) {
		return c.json({ error: "invalid_credentials" }, 401);
	}
	const session = await newSession();
	const now = Date.now();
	await insertSession(c.env.DB, {
		tokenHash: session.tokenHash,
		userId: user.id,
		expiresAt: now + 30 * 24 * 60 * 60 * 1000,
		lastSeenAt: now,
	});
	c.header("Set-Cookie", sessionCookie(session.token));
	return { ok: true };
});
```

For sign-out, delete the server-side session and send `clearSessionCookie()`
as the `Set-Cookie` header. Add `sessionResolver`, `requireSession()`, and
`csrfGuard()` as shown in the [auth guide](../guides/auth.md); creating a
password hash alone does not establish an authenticated session.

See [auth](../guides/auth.md).
