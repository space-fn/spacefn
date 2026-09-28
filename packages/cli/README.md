# @spacefn/cli

Unified CLI for SpaceFn projects. One command to rule them all.

```bash
npx space dev          # Start dev server
npx space build        # Build for production
npx space test         # Run tests with Vitest
npx space fmt          # Format code with Biome
npx space lint         # Lint code with Biome
npx space check        # Run all checks (fmt + lint + typecheck)
npx space run <name>   # Run custom script from scripts/
npx space run --list   # List available scripts
npx space db:generate  # Generate database migration
npx space db:migrate   # Run pending migrations
```

## Install

```bash
pnpm add -D @spacefn/cli biome vite vitest
```

Peer deps: `biome`, `vite`, `vitest` (you provide them).

## Script Runner

Create a `scripts/` directory in your project root. Scripts can be simple functions or full CLI commands with typed args.

### Simple scripts

```ts
// scripts/db:seed.ts
import { log } from "@spacefn/cli";

export default async function () {
  log.info("Seeding database...");
  // Your seed logic here
  log.success("Done!");
}
```

### Scripts with args (defineCmd)

```ts
// scripts/db:seed.ts
import { defineCmd, log } from "@spacefn/cli";

export default defineCmd({
  meta: { name: "db:seed", description: "Seed the database" },
  args: {
    count: { type: "number", description: "Number of records", default: 10 },
    clear: { type: "boolean", description: "Clear existing data first", alias: "c" },
  },
  async run({ args }) {
    log.info(`Seeding ${args.count} records...`);
    if (args.clear) log.info("Clearing existing data...");
    // Your seed logic here
    log.success("Done!");
  },
});
```

Run it:

```bash
npx space run db:seed                    # Simple invocation
npx space run db:seed -- --count 20      # With args
npx space run db:seed -- --count 20 -c   # With flags
```

List available scripts:

```bash
npx space run --list
```

## Utilities

Import CLI helpers for your own scripts:

```ts
import { log, spinner, exec, table, steps } from "@spacefn/cli";

// Colored logging
log.success("It works!");

// Spinner for async operations
await spinner("Loading...", async () => {
  await fetchData();
});

// Run shell commands
await exec("echo", ["hello"]);

// Pretty tables
console.log(table(["Name", "Value"], [["foo", "bar"]]));

// Interactive prompts (via @clack/prompts)
steps.intro("Welcome");
const name = await steps.text({ message: "What's your name?" });
steps.outro("Bye!");
```

## Default Config

Ships with a default `biome.json` config. If your project doesn't have one, the CLI uses the bundled default.

## Commands

| Command | Description |
|---------|-------------|
| `space dev` | Start Vite dev server |
| `space build` | Build for production |
| `space test` | Run tests with Vitest |
| `space fmt` | Format code with Biome |
| `space fmt --check` | Check formatting (don't write) |
| `space lint` | Lint code with Biome |
| `space lint --fix` | Lint and auto-fix issues |
| `space check` | Run fmt + lint + typecheck |
| `space run <name>` | Run script from `scripts/` |
| `space run --list` | List available scripts |
| `space db:generate` | Generate migration from schema |
| `space db:migrate` | Run pending migrations |
