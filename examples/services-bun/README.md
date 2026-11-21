# services-bun

spacefn's services on Bun: KV, a queue with its consumer, a cron, `public/` and the client build, deployed to a Docker container. spacefn's tests run it with `space dev`, build it, and deploy it to local Docker on port 4890.

```sh
pnpm dev                    # Vite, with the queue and cron in-process
pnpm build && pnpm deploy   # the image takes dist/; see configs/Dockerfile
```

`app/` only wires: the routes, the queue and the cron call `modules/status/`, and `lib/ui/` has the layout and base styles.
