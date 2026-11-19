# Datastar sign-up and sign-in

This example shows the browser and server parts of an email/password flow.
The page and its actions are setup; the rules live in an `accounts` module
that uses generated queries against `users` and `sessions` tables (as in the
playground), with a unique constraint on `users.email`.

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

## The accounts module

The rules of signing up and signing in live in `modules/accounts/`: what a valid email and password are, how a password is hashed, and how long a session lasts. The module uses the generated user and session queries and the request-free helpers from `spacefn/auth`. The pepper arrives as an argument, because a module never reads the environment.

```ts
// modules/accounts/accounts.ts

import { addSession, addUser, findUser } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import {
	hashPassword,
	hibpBreachCheck,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	newSession,
	verifyPassword,
} from "spacefn/auth";
import type { DbReader } from "spacefn/db";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export interface Credentials {
	email: unknown;
	password: unknown;
}

function read(input: Credentials) {
	return {
		email: String(input.email ?? "")
			.trim()
			.toLowerCase(),
		password: String(input.password ?? ""),
	};
}

export async function signUp(db: DbReader, input: Credentials, pepper: string) {
	const { email, password } = read(input);
	if (!EMAIL.test(email)) throw new AppError("invalid", "Enter a valid email address.");
	if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
		throw new AppError(
			"invalid",
			`Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
		);
	}
	let passwordHash: string;
	try {
		passwordHash = await hashPassword(password, { pepper, breachCheck: hibpBreachCheck() });
	} catch (error) {
		// hashPassword refuses breached passwords with a message meant for the user.
		throw new AppError(
			"invalid",
			error instanceof Error ? error.message : "Choose another password.",
		);
	}
	try {
		await addUser(db, { email, passwordHash });
	} catch (error) {
		// The unique email constraint decides, so two sign-ups cannot race past a lookup.
		if (String(error).includes("UNIQUE")) {
			throw new AppError("conflict", "That account could not be created.");
		}
		throw error;
	}
}

export async function signIn(db: DbReader, input: Credentials, pepper: string, now: number) {
	const { email, password } = read(input);
	const user = await findUser(db, { email });
	const result = user && (await verifyPassword(password, user.passwordHash, { pepper }));
	if (!user || !result?.valid) throw new AppError("unauthorized", "Wrong email or password.");

	const session = await newSession();
	await addSession(db, {
		tokenHash: session.tokenHash,
		userId: user.id,
		expiresAt: now + SESSION_MS,
		lastSeenAt: now,
	});
	return { token: session.token };
}
```

```ts
// modules/accounts/index.ts

export { signIn, signUp, type Credentials } from "./accounts";
```

## Actions

`app/pages/sign-in.server.ts` is setup: it reads the form and the secret, calls the module, sets the cookie, and renders the message. An `AppError` becomes the message the user sees:

```ts
// app/pages/sign-in.server.ts

import { mainDb } from "@app/db/main_db";
import { signIn, signUp } from "@modules/accounts";
import { AppError } from "@utils/errors";
import { sessionCookie } from "spacefn/auth";
import { defineActions, html } from "spacefn/pages";

function message(text: string) {
	return html`<p id="auth-result" role="status">${text}</p>`;
}

async function credentials(form: Promise<FormData>) {
	const data = await form;
	return { email: data.get("email"), password: data.get("password") };
}

export const actions = defineActions({
	signup: async (c) => {
		try {
			const input = await credentials(c.req.formData());
			await signUp(await mainDb(c.env.DB), input, c.env.PASSWORD_PEPPER);
			return c.html(message("Account created. You can now sign in."));
		} catch (error) {
			if (error instanceof AppError) return c.html(message(error.message));
			throw error;
		}
	},

	login: async (c) => {
		try {
			const input = await credentials(c.req.formData());
			const db = await mainDb(c.env.DB);
			const { token } = await signIn(db, input, c.env.PASSWORD_PEPPER, Date.now());
			c.header("Set-Cookie", sessionCookie(token));
			return c.html(message("Signed in."));
		} catch (error) {
			if (error instanceof AppError) return c.html(message(error.message));
			throw error;
		}
	},
});
```

The cookie and the response belong to the action because they are HTTP; the session itself is the module's. `signUp` relies on the database's unique email constraint rather than a check-then-insert sequence. Production sign-in should also rate-limit attempts and verify a decoy hash when the account is unknown, so an unknown email does not take a noticeably different path. The playground demonstrates that pattern in `app/routes/auth/login.ts`.

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
