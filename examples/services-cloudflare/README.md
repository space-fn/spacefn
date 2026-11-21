# services-cloudflare

Every binding a Cloudflare deploy creates, in use: D1 (`app/db/main/`), KV, R2, a queue with its consumer, a cron and the rate limiter. spacefn's tests run it with `alchemy dev` and read what each binding holds from `/`.

```sh
pnpm dev     # alchemy dev: every binding, locally
```

`app/` only wires: the routes, the queue and the cron call `modules/status/` and `modules/files/`, and `lib/ui/layout.ts` is the HTML around the page.
