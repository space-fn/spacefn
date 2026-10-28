# Changelog

## 0.5.0

### Added

- `spacefn/http`: `readUploads` and `putUpload` for multipart uploads with size limits and magic-byte type detection.
- `spacefn/ws`: `acceptSocket`, `broadcast`, `readMessage`, `requireWebSocket` helpers built on the Durable Object hibernation API.
- `SpaceError` now carries an optional HTTP `status`; `onError` maps it to a response.
- Docs: worked examples for file upload, WebSocket chat and scheduled jobs.

### Changed

- `cloudflare.config.ts` uses native `cf/config` (`defineConfig`) directly; `defineSpace` removed.
- Removed the `src/index.ts` barrel; import from sub-packages.

### Fixed

- `defineHandler` now maps `SpaceError` to its HTTP status (was always 500).
- Upload body cap enforced on chunked requests.
- Upload type is verified from magic bytes, not the client's `Content-Type`.
