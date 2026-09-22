# Routes

Convention-based file routing. File names map to URL patterns automatically.

## File Naming

| File                           | URL Pattern                | Methods |
| ------------------------------ | -------------------------- | ------- |
| `index.ts`                     | `/`                        | All     |
| `index.get.ts`                 | `/`                        | GET     |
| `index.post.ts`                | `/`                        | POST    |
| `books/index.ts`               | `/books`                   | All     |
| `books/index.get.ts`           | `/books`                   | GET     |
| `books/[slug]/index.get.ts`    | `/books/:slug`             | GET     |
| `categories/[id].ts`           | `/categories/:id`          | All     |
| `users/[id]/posts/[postId].ts` | `/users/:id/posts/:postId` | All     |

## Rules

1. **Base path**: `src/routes/`
2. **Entry point**: `index.ts` (or `index.<method>.ts`)
3. **Segments**: Folders and files become URL segments
4. **Parameters**: `[name]` in file names become `:name` in patterns
5. **Methods**: `.get.ts`, `.post.ts`, `.put.ts`, `.patch.ts`, `.delete.ts`
6. **All methods**: No method suffix = `*` (matches all methods)

## Route Handlers

Each route file exports a default function:

```ts
// src/routes/index.ts
export default function (request: Request): Response {
	return new Response("Hello World");
}
```

### With Parameters

```ts
// src/routes/books/[slug]/index.get.ts
export default function (request: Request): Response {
	// Read params from URL
	const url = new URL(request.url);
	const slug = url.pathname.split("/").pop();

	return new Response(`Book: ${slug}`);
}
```

### With HTML

```ts
// src/routes/index.ts
import { html, head, body, h } from "@spacefn/html";

export default function () {
	return new Response(html({}, head(), body({}, h.h1({}, "Home"))), {
		headers: { "Content-Type": "text/html" },
	});
}
```

### With DataStar

```ts
// src/routes/counter.ts
import { html, head, body, h } from "@spacefn/html";
import { ds } from "@spacefn/datastar";

export default function () {
	return new Response(
		html(
			{},
			head(),
			body(
				{},
				h.div(
					ds.dataSignals({ count: 0 }),
					h.button(ds.dataOn("click", "$count++"), "Count: ", h.span(ds.dataText("$count"), "0")),
				),
			),
		),
		{ headers: { "Content-Type": "text/html" } },
	);
}
```

## Route File Structure

Each route file should follow this pattern:

```ts
// 1. Imports
import { html, head, body, h } from "@spacefn/html";

// 2. Handler function
export default function (request: Request): Response {
	// 3. Logic
	// 4. Return Response
	return new Response(html({}, head(), body({}, h.h1({}, "Page"))), {
		headers: { "Content-Type": "text/html" },
	});
}
```

## Static Assets

Place files in `public/` for static serving:

```
public/
  favicon.ico
  images/
    logo.png
```

Access via `/favicon.ico`, `/images/logo.png`.

## Error Handling

Routes can throw errors. The `onError` callback in `createServer` handles them:

```ts
import { createServer } from "@spacefn/server";

export default createServer({
	routes,
	middlewares,
	onError(error, request) {
		return new Response("Something went wrong", { status: 500 });
	},
});
```
