# Testing API (`spacefn/testing`)

`testFetch(worker, path, init?, env?)` sends a `Request` to a Worker-like
object and returns its `Response`:

```ts
import { testFetch } from "spacefn/testing";

const response = await testFetch(worker, "/health", { method: "GET" }, testEnv);
```

Relative paths are resolved against `http://localhost`; absolute URLs pass
through. `init` is a standard `RequestInit` and `env` is passed as the second
argument to `worker.fetch`. The helper does not create a Worker or provide a
Cloudflare execution context. See the [testing guide](../guides/testing.md) for
application and binding test patterns.
