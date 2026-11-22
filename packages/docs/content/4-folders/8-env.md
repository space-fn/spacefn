---
title: .env
icon: key
---

# .env

Values for the variables in [`configs/env.ts`](6-configs.md#envts), one file per place the app runs:

```txt
my-app/
├── .env.example       committed: every variable, with safe example values
├── .env               your machine: space dev and space db
├── .env.staging       space deploy --stage staging
└── .env.prod          space deploy (the default stage, prod)
```

```sh [.env]
SITE_URL=http://localhost:3000
STRIPE_KEY=sk_test_...
```

A deploy reads only `.env.<stage>`, never `.env`, so local values can't reach production. Variables already set in the environment, as CI sets them, are passed on too, so CI needs no file.

Commit `.env.example` only: the scaffolded `.gitignore` keeps every other `.env` file out of git. A new teammate copies it to `.env`.

Besides your own, spacefn reads a few:

| Variable                                       | What it's for                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DB_<NAME>_URL`, `DB_<NAME>_AUTH_TOKEN`        | a libSQL database: Turso, `sqld`, or a `file:`                                      |
| `SPACE_STATE_URL`, `SPACE_STATE_AUTH_TOKEN`    | the state database on Bun                                                           |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `_HEADERS`      | where traces, logs and metrics go                                                   |
| `PORT`, `HOST`, `SPACE_DATA_DIR`, `SPACE_ROLE` | the Bun server; see [Bun](../5-deployment/2-bun.md)                                 |
| `SPACE_DEV_PORT`                               | `space dev --port` on Cloudflare; see [Cloudflare](../5-deployment/1-cloudflare.md) |
