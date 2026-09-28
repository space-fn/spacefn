# @spacefn/cli

Unified CLI for SpaceFn projects. One command for dev, build, test, format, lint, and custom scripts.

## Install

```bash
pnpm add -D @spacefn/cli @biomejs/biome vite vitest
```

Peer deps: `@biomejs/biome`, `vite`, `vitest` (you provide them).

Optional: `@spacefn/db` for `db:generate` and `db:migrate` commands.

## Commands

| Command | Description |
|---------|-------------|
| `space dev` | Start Vite dev server |
| `space dev --port 3000` | Start on custom port |
| `space build` | Build for production |
| `space test` | Run tests with Vitest |
| `space test --watch` | Run in watch mode |
| `space test --coverage` | Run with coverage |
| `space fmt` | Format code with Biome |
| `space fmt --check` | Check formatting (don't write) |
| `space lint` | Lint code with Biome |
| `space lint --fix` | Lint and auto-fix issues |
| `space check` | Run fmt + lint + typecheck |
| `space run <name>` | Run script from `scripts/` |
| `space run -- --list` | List available scripts |
| `space db:generate` | Generate migration from schema |
| `space db:migrate` | Run pending migrations |

## Script runner

Create a `scripts/` directory for custom scripts:

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
space run db:seed
```

### Typed scripts with defineCmd

For scripts with arguments and flags, use `defineCmd`:

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

Run with args (use `--` to separate space args from script args):

```bash
space run db:seed -- --count 20
space run db:seed -- --count 20 -c
```

## Utilities

Import CLI helpers for your own scripts:

```ts
import { log, spinner, exec, table, steps, defineCmd, colors } from "@spacefn/cli";

// Colored logging
log.success("It works!");
log.info("Info message");
log.warn("Warning");
log.error("Something broke");

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

// Colors (picocolors)
console.log(colors.green("Success!"));
console.log(colors.bold(colors.red("Error!")));
```

## Default config

Ships with a default `biome.json`. If your project doesn't have one, the CLI uses the bundled default. To customize, create a `biome.json` in your project root.
