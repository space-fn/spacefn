# Examples

Worked examples that tie together the concepts and reference pages. Start
with the [Datastar guide](../guides/datastar.md) for the recommended
server-rendered frontend path.

| Scenario                                      | What it covers                                                     |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [Todo board](./todo-crud.md)                  | D1 migrations and queries, page loader/actions, Datastar fragments |
| [Sign-up and sign-in](./auth-flow.md)         | Datastar forms, password hashing, sessions, CSRF guard             |
| [File upload](./file-upload.md)               | Multipart limits, type checks, R2 storage, authorized download     |
| [Signed webhook](./webhook-receiver.md)       | Timestamped HMAC verification, queueing, idempotent processing     |
| [Scheduled digest](./scheduled-job.md)        | Cron fan-out, typed queue producers, retries                       |
| [Order workflow](./order-workflow.md)         | Durable multi-step work, retries, status endpoint                  |
| [Tenant-scoped data](./tenant-scoped-data.md) | Tenant resolution and per-tenant Durable Object storage            |
| [Server-Sent Events](./server-sent-events.md) | Route streams, Durable Object fan-out, browser EventSource         |
| [WebSocket chat room](./chat-room.md)         | Durable Object hibernation, validation, browser client             |
| [Virtual scroller](./virtual-scroller.md)     | Rocket component and upstream implementation reference             |

Other useful Datastar walkthroughs:

- [Search as you type](../guides/datastar.md#search-as-the-user-types) — debounced input and server-rendered result fragments.
- [Offline response / PWA](../guides/datastar.md#add-a-pwa-offline-response) — service worker returning an HTML fragment without a PWA runtime.
- [Reusable components](../guides/datastar-components.md) — Rocket components in `app/client/`.

These are starting points, not complete production systems. Add application
authentication, authorization, validation, retention, and operational
monitoring for your use case.
