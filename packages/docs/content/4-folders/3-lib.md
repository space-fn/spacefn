---
title: lib/
icon: components
---

# lib/

Code the features share and none of them owns: the UI kit and its design tokens, the layout around every page, your own services, and small helpers.

```txt
lib/
├── ui/
│   ├── layout.ts          the HTML around every page
│   ├── base.css           design tokens and base styles
│   ├── button.ts          components every feature uses
│   └── island.ts          helpers for client components
├── auth/
│   └── admin.ts           requireAdmin, for _middleware.ts files
├── mailer.ts              a service, listed in app/entry.ts
└── format.ts              money, dates, plurals
```

Import it with `#lib/...`, in TypeScript and in CSS:

```ts
import { layout } from "#lib/ui/layout.ts";
```

```css [app/assets/site.css]
@import "#lib/ui/base.css";
```

## Design tokens and components

Keep the tokens in one stylesheet as custom properties, and have components use them:

```css [lib/ui/base.css]
:root {
	--color-text: #1f2328;
	--color-accent: #c2185b;
	--space-2: 0.5rem;
	--radius: 8px;
}
```

```ts [lib/ui/button.ts]
import { html } from "spacefn";

export const button = (props: { readonly label: string; readonly action: string }) =>
	html`<form method="post" action="${props.action}">
		<button class="button">${props.label}</button>
	</form>`;
```

## Services

A service of your own is an Effect `Context.Service` with a layer. Put it in `lib/` when every feature can use it, and list its layer in [`app/entry.ts`](1-app/1-entry.md). See [Services](../6-guides/6-services.md#your-own-services).

## The rule

`lib/` doesn't import `modules/`. That keeps it reusable, and makes the direction of every import obvious: `app/` → `modules/` → `lib/`.
