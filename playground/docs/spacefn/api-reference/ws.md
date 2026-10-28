# WebSocket helpers (`spacefn/ws`)

- `acceptSocket(ctx, request, options?)`: validates the upgrade, accepts the socket via the hibernation API, stores an attachment, returns the 101 response. Throws `SpaceError` 426 (not an upgrade) or 403 (bad origin).
- `broadcast(ctx, message, { except })`: sends to every socket except `except`.
- `readMessage(raw, { maxSize, parse })`: returns `{ ok, value }` or `{ ok: false, code, reason }`. Code 1009 for oversize, 1008 when `parse` throws.
- `requireWebSocket(request, origins?)`: throws `SpaceError` 426/403.

Close codes: 1008 (policy violation, bad message), 1009 (message too big).
