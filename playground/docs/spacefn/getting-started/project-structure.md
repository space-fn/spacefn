# Project structure

A spacefn project looks like this:

```txt
my-app/
├── app/
│   ├── routes/            HTTP endpoints
│   ├── middleware/        Request middleware
│   ├── queues/            Queue consumers
│   ├── crons/             Scheduled jobs
│   ├── durable-objects/   Durable Object classes
│   ├── workflows/         Workflow classes
│   ├── pages/             Server-rendered pages
│   ├── client/            Browser TS/CSS entries
│   ├── db/                Databases (migrations + queries)
│   └── env.ts             Environment fields
├── modules/               Domain logic (recommended)
├── utils/, lib/           Shared helpers
├── .space/                Generated code (do not edit)
├── docs/                  Project docs (served at /__space_docs/)
├── cloudflare.config.ts   Cloudflare bindings
├── vite.config.ts
└── package.json
```

Each folder in `app/` does one job. Files are found by name, so there is no registry. See [Directory structure](../directory-structure/) for the details of each.
