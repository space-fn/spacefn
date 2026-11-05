# Forms and validation

Use ordinary HTML forms for navigation and Datastar for in-place updates.
Page actions live in the colocated `*.server.ts` file; the browser calls them
with `actions.<name>.path()` instead of a separate route.

## Render a form

Create `app/pages/contact.page.ts`:

```ts
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
					<textarea name="message" required maxlength="2000"></textarea>
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

## Validate on the server

Create `app/pages/contact.server.ts`:

```ts
import { sendContactMessage } from "@modules/contact";
import { defineActions, html } from "spacefn/pages";

export const actions = defineActions({
	send: async (c) => {
		const form = await c.req.formData();
		const email = String(form.get("email") ?? "").trim();
		const message = String(form.get("message") ?? "").trim();
		const errors: string[] = [];

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errors.push("Enter a valid email address.");
		}
		if (message.length === 0 || message.length > 2000) {
			errors.push("Message must be between 1 and 2000 characters.");
		}
		if (errors.length > 0) {
			return c.html(
				html`<div id="form-result" role="alert">
					<ul>
						${errors.map((error) => html`<li>${error}</li>`)}
					</ul>
				</div>`,
			);
		}

		await sendContactMessage({ email, message });
		return c.html(html`<div id="form-result" role="status">Message sent.</div>`);
	},
});
```

`sendContactMessage` is app-owned. `html` escapes interpolated values, but
validation is still needed for business rules, length limits, authorization,
and downstream constraints. Never treat browser attributes such as `required`,
`maxlength`, `type="email"`, or disabled controls as server-side validation.

## Return errors as data or HTML

For JSON endpoints, use a status-bearing JSON response:

```ts
if (!title) return c.json({ error: "title_required" }, 400);
```

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
