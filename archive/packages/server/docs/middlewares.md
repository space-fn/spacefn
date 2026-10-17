# Middlewares

Preprocessing functions that run before route handlers. Modify requests, add headers, log activity.

## File Naming

| File          | Order | Purpose                            |
| ------------- | ----- | ---------------------------------- |
| `1.logger.ts` | 1     | Logs requests (runs first)         |
| `2.cors.ts`   | 2     | Adds CORS headers (runs second)    |
| `3.auth.ts`   | 3     | Checks authentication (runs third) |

## Rules

1. **Base path**: `src/middlewares/`
2. **Naming**: `<order>.<name>.ts` (e.g., `1.logger.ts`)
3. **Order**: Lower numbers run first
4. **No prefix**: Files without a number prefix run last

## Middleware Structure

Each middleware exports a default function:

```ts
// src/middlewares/1.logger.ts
export default function (request: Request, next: () => Response): Response {
	console.log(`[LOG] ${request.method} ${request.url}`);
	return next();
}
```

### Async Middleware

```ts
// src/middlewares/2.cors.ts
export default async function (request: Request, next: () => Response): Response {
	const response = await next();
	response.headers.set("Access-Control-Allow-Origin", "*");
	return response;
}
```

### Conditional Middleware

```ts
// src/middlewares/3.auth.ts
export default function (request: Request, next: () => Response): Response {
	const url = new URL(request.url);

	// Skip auth for public routes
	if (url.pathname.startsWith("/public")) {
		return next();
	}

	// Check auth header
	const token = request.headers.get("Authorization");
	if (!token) {
		return new Response("Unauthorized", { status: 401 });
	}

	return next();
}
```

## Examples

### Logging

```ts
// src/middlewares/1.logger.ts
export default function (request: Request, next: () => Response): Response {
	const start = Date.now();
	const response = next();
	const duration = Date.now() - start;
	console.log(`[${request.method}] ${request.url} - ${duration}ms`);
	return response;
}
```

### CORS

```ts
// src/middlewares/2.cors.ts
export default function (request: Request, next: () => Response): Response {
	const response = next();
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type");
	return response;
}
```

### Security Headers

```ts
// src/middlewares/4.security.ts
export default function (request: Request, next: () => Response): Response {
	const response = next();
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	response.headers.set("X-XSS-Protection", "1; mode=block");
	return response;
}
```

### Request Timing

```ts
// src/middlewares/0.timer.ts
export default function (request: Request, next: () => Response): Response {
	const start = performance.now();
	const response = next();
	const duration = performance.now() - start;
	response.headers.set("Server-Timing", `total;dur=${duration.toFixed(2)}`);
	return response;
}
```

## Middleware Chain

Middlewares run in order (lowest number first), then the route handler runs, then middlewares run in reverse order (post-processing).

```
Request
  ↓
[0] timer.ts       (pre)
[1] logger.ts      (pre)
[2] cors.ts        (pre)
[3] auth.ts        (pre)
  ↓
Route Handler
  ↓
[3] auth.ts        (post)
[2] cors.ts        (post)
[1] logger.ts      (post)
[0] timer.ts       (post)
Response
```

## Error Handling

If a middleware throws, the error propagates to `createServer`'s `onError` handler. The route handler never runs.

```ts
export default function (request: Request, next: () => Response): Response {
	const token = request.headers.get("Authorization");
	if (!token) {
		throw new Error("Missing auth token"); // Caught by onError
	}
	return next();
}
```
