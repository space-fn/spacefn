# Datastar sign-up and sign-in

This example shows the browser and server parts of an email/password flow.
User storage (`findUserByEmail`, `registerUser`, and `insertSession`) is
app-owned; use parameterized database queries and enforce a unique email
constraint in the database.

## Page

Create `app/pages/sign-in.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { actions } from "./sign-in.server";

export default definePage(
	() =>
		html`<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>Sign in</title>
					<script
						type="module"
						src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js"
					></script>
				</head>
				<body>
					<main>
						<form
							data-on:submit__prevent="@post('${actions.signup.path()}', {contentType: 'form'})"
						>
							<h1>Create account</h1>
							<label>Email <input type="email" name="email" required autocomplete="email" /></label>
							<label
								>Password
								<input
									type="password"
									name="password"
									required
									minlength="12"
									autocomplete="new-password"
								/>
							</label>
							<button>Create account</button>
						</form>

						<form data-on:submit__prevent="@post('${actions.login.path()}', {contentType: 'form'})">
							<h2>Sign in</h2>
							<label>Email <input type="email" name="email" required autocomplete="email" /></label>
							<label
								>Password
								<input type="password" name="password" required autocomplete="current-password" />
							</label>
							<button>Sign in</button>
						</form>

						<p id="auth-result" role="status"></p>
					</main>
				</body>
			</html>`,
);
```

Both forms post to actions on the same page. Datastar sends form values as
`application/x-www-form-urlencoded`; the action reads them with
`c.req.formData()` and returns a fragment with the matching `auth-result` ID.

## Actions

Create `app/pages/sign-in.server.ts`:

```ts
import { findUserByEmail, insertSession, registerUser } from "@modules/users";
import {
	hashPassword,
	hibpBreachCheck,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	newSession,
	sessionCookie,
	verifyPassword,
} from "spacefn/auth";
import { defineActions, html } from "spacefn/pages";

function message(text: string) {
	return html`<p id="auth-result" role="status">${text}</p>`;
}

export const actions = defineActions({
	signup: async (c) => {
		const form = await c.req.formData();
		const email = String(form.get("email") ?? "")
			.trim()
			.toLowerCase();
		const password = String(form.get("password") ?? "");

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return c.html(message("Enter a valid email address."));
		}
		if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
			return c.html(
				message(`Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`),
			);
		}

		let passwordHash: string;
		try {
			passwordHash = await hashPassword(password, {
				pepper: c.env.PASSWORD_PEPPER,
				breachCheck: hibpBreachCheck(),
			});
		} catch (error) {
			return c.html(message(error instanceof Error ? error.message : "Could not hash password."));
		}
		const created = await registerUser(c.env.DB, { email, passwordHash });
		if (!created) return c.html(message("That account could not be created."));

		return c.html(message("Account created. You can now sign in."));
	},

	login: async (c) => {
		const form = await c.req.formData();
		const email = String(form.get("email") ?? "")
			.trim()
			.toLowerCase();
		const password = String(form.get("password") ?? "");
		const user = await findUserByEmail(c.env.DB, email);
		if (!user) return c.html(message("Wrong email or password."));

		const result = await verifyPassword(password, user.passwordHash, {
			pepper: c.env.PASSWORD_PEPPER,
		});
		if (!result.valid) return c.html(message("Wrong email or password."));

		const session = await newSession();
		const now = Date.now();
		await insertSession(c.env.DB, {
			tokenHash: session.tokenHash,
			userId: user.id,
			expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			lastSeenAt: now,
		});
		c.header("Set-Cookie", sessionCookie(session.token));
		return c.html(message("Signed in."));
	},
});
```

`registerUser` should return `false` for a duplicate email using an atomic
database constraint; do not rely on a separate check-then-insert sequence.
Production sign-in should rate-limit attempts and verify a decoy hash when
the account is unknown, so an unknown email does not take a noticeably
different path. The playground demonstrates that pattern in
`app/routes/auth/login.ts`.

## Protect mutations against CSRF

Register `csrfGuard` before routes in `app/entry.ts`, or use the middleware
folder:

```ts
// app/middleware/04-csrf.ts
import { csrfGuard } from "spacefn/auth";
import { defineMiddleware } from "spacefn/middleware";

export default defineMiddleware(csrfGuard({ cookie: "session", origins: [] }));
```

`csrfGuard` checks browser `Origin` / `Sec-Fetch-Site` signals for
state-changing requests. It is not a hidden-form-token helper and does not
replace authentication or authorization. Add allowed origins when the app
intentionally accepts requests from another origin.

## What to add in a real app

- Add a session resolver and require a signed-in user for protected pages and
  actions. See the [auth guide](../guides/auth.md).
- Add sign-out by deleting the server-side session and setting
  `clearSessionCookie()` as the `Set-Cookie` header.
- Add email verification, password reset, and account-recovery flows before
  using this as a production sign-in system.
- Keep secrets such as `PASSWORD_PEPPER` in Worker secrets, not in source or
  the database.

See [Auth](../guides/auth.md) and [Datastar](../guides/datastar.md).
