# Modules

`modules/` at the project root holds business logic that is not a Cloudflare convention. The framework does not scan it; import it from `app/` files.

## Layout

```txt
modules/
├── auth/
│   └── users.ts
└── billing/
    └── invoices.ts
```

Keep `app/` for Cloudflare-facing code (routes, queues, crons, durable objects, workflows, db) and `modules/` for domain logic. This keeps the convention folder small and the business logic testable on its own.

```ts
// app/routes/todos.ts
import { listTodos } from "@modules/todos";

export const GET = defineHandler(() => listTodos());
```
