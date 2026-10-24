# Generated code (`.space/`)

Spacefn generates `.space/` from your folders. You import from it; never edit it.

| Helper                                    | Import                 | What it gives you                          |
| ----------------------------------------- | ---------------------- | ------------------------------------------ |
| `routes`                                  | `@space` (re-exported) | Route table registration                   |
| `pages`                                   | `@space`               | Page registration                          |
| `client`, `script`, `styles`, `clientUrl` | `@space/client`        | Hashed client asset tags                   |
| `queues`                                  | `@space/queues`        | Typed queue producers                      |
| `env`                                     | `spacefn/env`          | Typed environment                          |
| `db/*`                                    | `@space/db/<name>`     | Typed query functions and migration runner |

`.space/` is regenerated on every dev start and build. Commit it or not — it's deterministic.
