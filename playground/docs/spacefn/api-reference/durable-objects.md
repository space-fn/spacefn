# Durable Objects API (`spacefn/durable-objects`)

Classes under `app/durable-objects/` become Worker exports and bindings. The
[Durable Objects guide](../directory-structure/durable-objects.md) describes
the class and storage conventions.

| API                                       | Behavior                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `durableObjectsConfig(files, workerName)` | Builds the `cf/config` `exports` and `env` entries for the discovered files.                                       |
| `durableObjectClassName(file)`            | Converts a filename such as `chat-room.ts` to `ChatRoom`.                                                          |
| `durableObjectBinding(file)`              | Converts a filename such as `chat-room.ts` to `DO_CHAT_ROOM`.                                                      |
| `unwrapDurableObject<T>(binding)`         | Returns the underlying binding when the dev proxy exposes it as `.binding`; otherwise returns the input unchanged. |

The Vite plugin calls `durableObjectsConfig` automatically. Generated
namespaces use SQLite storage and are added to the Worker environment; do not
declare the derived bindings a second time. `unwrapDurableObject` is a
low-level compatibility helper for code working with development bindings.
