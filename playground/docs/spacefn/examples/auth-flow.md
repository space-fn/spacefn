# Auth flow

```ts
import { hashPassword } from "spacefn/auth";
// app/routes/auth/signup.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email, password } = await c.req.json();
	const hash = await hashPassword(password);
	await c.env.DB.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
		.bind(email, hash)
		.run();
	return { ok: true };
});
```

```ts
import { verifyPassword } from "spacefn/auth";
// app/routes/auth/login.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email, password } = await c.req.json();
	const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE email = ?")
		.bind(email)
		.first<{ password_hash: string }>();
	if (!row || !(await verifyPassword(password, row.password_hash))) {
		return c.json({ error: "invalid_credentials" }, 401);
	}
	return { ok: true };
});
```

See [auth](../guides/auth.md).
