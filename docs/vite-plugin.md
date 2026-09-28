# @spacefn/vite-plugin

Generic file-based code generation for Vite. Runs generators at build time, watches inputs during development, writes only changed output, invalidates SSR modules, and requests a full reload.

## Install

```bash
pnpm add -D @spacefn/vite-plugin vite
```

## Quick start

```ts
import { defineConfig } from "vite";
import { generators } from "@spacefn/vite-plugin";

export default defineConfig({
  plugins: [
    generators({
      watch: "src/**/*.ts",
      output: ".space/files.ts",
      generate(files) {
        return `export const files = ${JSON.stringify(files)};`;
      },
    }),
  ],
});
```

## Multiple generators

Pass multiple generators to `generators()`:

```ts
import { generators } from "@spacefn/vite-plugin";
import { apiGenerator } from "@spacefn/vite-plugin";
import { pageGenerator } from "@spacefn/vite-plugin";
import { dbGenerator } from "@spacefn/vite-plugin";

export default defineConfig({
  plugins: [
    generators(
      apiGenerator({ srcDir: "src/api" }),
      pageGenerator({ srcDir: "src/pages" }),
      dbGenerator({ schema: "src/db/schema.ts" }),
    ),
  ],
});
```

## API

```ts
interface Generator {
  watch: string | string[];
  output: string;
  generate(files: string[]): string | Promise<string>;
}
```

### `generators(...defs)`

Returns a Vite `PluginOption`. Runs all generators at build start. During development, watches files and regenerates on change with 100ms debounce.

### Built-in generators

| Generator | Watch | Output | Description |
|-----------|-------|--------|-------------|
| `apiGenerator` | `src/api/**/*.ts` | `.space/api.ts` | API route registrations |
| `pageGenerator` | `src/pages/**/*.ts` | `.space/pages.ts` | Page route registrations |
| `dbGenerator` | `src/db/**/*.ts` | `.space/db/types.ts` | Database type generation |

### Custom generator

```ts
generators({
  watch: "locales/**/*.json",
  output: ".space/locales.ts",
  generate(files) {
    const locales = files.map((f) => f.replace("locales/", "").replace(".json", ""));
    return `export const locales = ${JSON.stringify(locales)};`;
  },
});
```

## Behavior

- Generators run once during build.
- During dev, changed inputs regenerate affected outputs.
- Non-TypeScript inputs are build-time only.
- Outputs are relative to the configured root.
- Add `.space/` to `.gitignore` when using generated files.
