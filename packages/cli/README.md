# @spacefn/cli

Unified CLI for SpaceFn projects. One command to rule them all.

```bash
npx space dev          # Start dev server
npx space build        # Build for production
npx space fmt          # Format code with Biome
npx space lint         # Lint code with Biome
npx space check        # Run all checks (fmt + lint + typecheck)
npx space run --name=<name>  # Run custom script from scripts/
npx space run --list         # List available scripts
npx space db:generate  # Generate database migration
npx space db:migrate   # Run pending migrations
```

## Install

```bash
pnpm add -D @spacefn/cli biome vite vitest
```

Peer deps: `biome`, `vite`, `vitest` (you provide them).

## Script Runner

Create a `scripts/` directory in your project root:

```ts
// scripts/db:seed.ts
import { log } from "@spacefn/cli";

export default async function () {
  log.info("Seeding database...");
  // Your seed logic here
  log.success("Done!");
}
```

Run it:

```bash
npx space run --name=db:seed
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
| `space fmt` | Format code with Biome |
| `space fmt --check` | Check formatting (don't write) |
| `space lint` | Lint code with Biome |
| `space lint --fix` | Lint and auto-fix issues |
| `space check` | Run fmt + lint + typecheck |
| `space run --name=<name>` | Run script from `scripts/` |
| `space run --list` | List available scripts |
| `space db:generate` | Generate migration from schema |
| `space db:migrate` | Run pending migrations |
