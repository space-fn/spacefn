---
title: .space/
icon: wand
---

# .space/

What spacefn generates from `app/`: plain TypeScript you can read, but never edit. `space gen` writes it, `npm install` runs that, and `space dev` rewrites it on every change. It's in `.gitignore`.

```txt
.space/
├── manifest.ts         the routes, middleware, queues, crons and databases, as data
├── db/
│   └── main.ts         MainDb: the typed queries of app/db/main/
├── assets.d.ts         the names assets(...) accepts, from app/client/
├── entry.ts            the target's entry, running app/entry.ts
├── infra.ts            what configs/infra.ts creates, as plain data
├── vite.config.ts      points Vite at configs/vite.ts
└── data/               local databases and blobs under space dev (Bun)
```

You import three of them:

| Import                | What it gives                                 |
| --------------------- | --------------------------------------------- |
| `#space/manifest.ts`  | `manifest`, for `app(...)` and `testApp(...)` |
| `#space/db/<name>.ts` | the database class, such as `MainDb`          |
| `#space/infra.ts`     | `app`, for `configs/infra.ts`                 |

If something in it looks wrong, the cause is in `app/` or `configs/`: fix it there and run `space gen`, which reports errors with the file and a hint. `space clean` deletes it, keeping the local data.
