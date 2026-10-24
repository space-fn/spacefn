# Getting started

This guide takes you from an empty folder to a running app in a few minutes.

## 1. Create a project

```sh
npm create spacefn my-app
cd my-app
```

This copies the template and installs dependencies.

## 2. Run it

```sh
npm run dev
```

Open the URL it prints. You now have a working app on `workerd`.

## 3. Add a route

Create `app/routes/hello.ts`:

```ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(() => {
	return { message: "hello" };
});
```

Visit `/hello`. The route is picked up automatically - no registration needed.

## 4. Add a page

Create `app/pages/hello.page.ts`:

```ts
import { html } from "spacefn/html";

export default () => html`<h1>Hello</h1>`;
```

Visit `/hello` again - the page and the route cannot share a path, so rename one if they clash.

## 5. Where to go next

- [Project structure](./project-structure.md) - what each folder does.
- [Directory structure](../directory-structure/) - every convention folder in detail.
- [How it works](../concepts/how-it-works.md) - what spacefn does under the hood.
- [API reference](../api-reference/) - exact signatures.
