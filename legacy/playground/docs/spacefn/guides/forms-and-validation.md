# Forms and validation

Use ordinary HTML forms for navigation and Datastar for in-place updates.
Page actions live in the colocated `*.server.ts` file; the browser calls them
with `actions.<name>.path()` instead of a separate route.

## Render a form

Create `app/pages/contact.page.ts`:

```ts
// app/pages/contact.page.ts

import { MAX_MESSAGE } from "@modules/contact";
import { definePage, html } from "spacefn/pages";

import { actions } from "./contact.server";

export default definePage(
	() =>
		html`<main>
			<h1>Contact</h1>
			<form data-on:submit__prevent="@post('${actions.send.path()}', {contentType: 'form'})">
				<label>
					Email
					<input type="email" name="email" required autocomplete="email" />
				</label>
				<label>
					Message
					<textarea name="message" required maxlength=${MAX_MESSAGE}></textarea>
				</label>
				<button type="submit">Send</button>
			</form>
			<div id="form-result" aria-live="polite"></div>
		</main>`,
);
```

`contentType: 'form'` sends the form as URL-encoded fields. Datastar
intercepts the submit and morphs the matching element returned by the action.
For multipart file inputs, use a regular multipart request and
[`readUploads`](../examples/file-upload.md); do not assume URL-encoded form
submission carries files.

## Validate in a module

What a valid contact message is belongs to the feature, not the action. The
module checks every field, collects all the problems at once, and only sends a
message that passed:

```ts
// modules/contact/contact.ts

import type { Email } from "@lib/email";

export const MAX_MESSAGE = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactInput {
	email: unknown;
	message: unknown;
}

export type ContactResult =
	| { ok: true; value: { email: string; message: string } }
	| { ok: false; errors: string[] };

export function checkContact(input: ContactInput): ContactResult {
	const email = String(input.email ?? "").trim();
	const message = String(input.message ?? "").trim();
	const errors: string[] = [];
	if (!EMAIL.test(email)) errors.push("Enter a valid email address.");
	if (message.length === 0 || message.length > MAX_MESSAGE) {
		errors.push(`Message must be between 1 and ${MAX_MESSAGE} characters.`);
	}
	return errors.length ? { ok: false, errors } : { ok: true, value: { email, message } };
}

export async function sendContact(send: (email: Email) => Promise<void>, input: ContactInput) {
	const result = checkContact(input);
	if (result.ok) {
		await send({
			to: "support@example.com",
			subject: `Contact from ${result.value.email}`,
			body: result.value.message,
		});
	}
	return result;
}
```

The fragments the action sends back are the module's too:

```ts
// modules/contact/views.ts

import { html } from "spacefn/html";

import type { ContactResult } from "./contact";

export function contactResult(result: ContactResult) {
	if (result.ok) return html`<div id="form-result" role="status">Message sent.</div>`;
	return html`<div id="form-result" role="alert">
		<ul>
			${result.errors.map((error) => html`<li>${error}</li>`)}
		</ul>
	</div>`;
}
```

```ts
// modules/contact/index.ts

export { checkContact, MAX_MESSAGE, sendContact, type ContactResult } from "./contact";
export { contactResult } from "./views";
```

## Read the form in the action

Create `app/pages/contact.server.ts`. The action is setup: it reads the form,
supplies the queue producer, and renders the result:

```ts
// app/pages/contact.server.ts

import { contactResult, sendContact } from "@modules/contact";
import { queues } from "@space/queues";
import { defineActions } from "spacefn/pages";

export const actions = defineActions({
	send: async (c) => {
		const form = await c.req.formData();
		const result = await sendContact((email) => queues.emails.send(email), {
			email: form.get("email"),
			message: form.get("message"),
		});
		return c.html(contactResult(result));
	},
});
```

`html` escapes interpolated values, but validation is still needed for
business rules, length limits, authorization, and downstream constraints.
Never treat browser attributes such as `required`, `maxlength`, `type="email"`,
or disabled controls as server-side validation. The page reads
`MAX_MESSAGE` from the module for its `maxlength`, so the two limits never
drift apart.

Because `checkContact` is a plain function, its rules are tested without a
Worker:

```ts
// modules/contact/contact.test.ts

import { expect, test } from "vite-plus/test";

import { checkContact } from "./contact";

test("reports every problem at once", () => {
	const result = checkContact({ email: "nope", message: "" });
	expect(result.ok).toBe(false);
	expect(!result.ok && result.errors).toHaveLength(2);
});
```

## Return errors as data or HTML

A module reports a single failure by throwing an `AppError`; for a JSON route,
`app.onError` turns it into a status-bearing response (see
[errors](../directory-structure/modules.md#errors-cross-the-boundary-as-apperror)).
When a form can have several problems at once, return them as data, as
`checkContact` does, and render them.

For a page action, return an HTML fragment with a stable target ID so the
user can correct the form without a page reload. For a successful conventional
HTML form submission, returning `undefined` redirects back to the page with
303; see [page actions](../directory-structure/pages.md#data-and-actions).

## Protect mutations

Use `csrfGuard` on state-changing requests and authenticate/authorize each
operation. The guard checks browser origin signals; it does not issue or verify
a hidden CSRF token and it does not decide whether a user may perform an
action. See [Auth](./auth.md#cross-site-request-guard).

See [Datastar](./datastar.md), [Pages](../directory-structure/pages.md),
and [File upload](../examples/file-upload.md).
