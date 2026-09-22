# @spacefn/vite-plugin

File-based code generation for Vite. Watch files, generate output, invalidate on change. Generic — no framework assumptions.

## Install

```bash
pnpm add -D @spacefn/vite-plugin vite
```

## Quick Start

```ts
// vite.config.ts
import { space } from "@spacefn/vite-plugin";

export default {
	plugins: [
		space({
			generators: [
				{
					watch: "src/**/*.ts",
					output: ".space/routes.ts",
					generate(files) {
						return `export const routes = ${JSON.stringify(files)}`;
					},
				},
			],
		}),
	],
};
```

## API

### `space(options)`

Vite plugin that runs code generators.

```ts
space({
  root?: string,       // Working directory (default: cwd)
  generators?: Generator[]
})
```

### `Generator`

```ts
interface Generator {
	/** Glob pattern(s) to watch */
	watch: string | string[];
	/** Output file path (relative to root) */
	output: string;
	/** Generate content from matched files */
	generate(files: string[]): string | Promise<string>;
}
```

## What It Does

**Build time**: Runs all generators once. Writes output files.

**Development**: Watches generator source globs. On change:

1. Regenerates affected outputs
2. Invalidates Vite SSR modules
3. Sends full-reload to client

**Config**: Adds `.space` resolve alias for generated files.

## Examples

### Route Generation

```ts
{
  watch: "pages/**/*.page.ts",
  output: ".space/routes.ts",
  generate(files) {
    const imports = files.map((f, i) =>
      `import Page_${i} from "${f}"`
    ).join("\n")

    const routes = files.map((f, i) => {
      const pattern = f.replace(/\.page\.ts$/, "").replace(/\[(\w+)\]/g, ":$1")
      return `{ pattern: "${pattern}", component: Page_${i} }`
    }).join(",\n")

    return `${imports}\n\nexport const routes = [\n${routes}\n]`
  },
}
```

### Type Generation

```ts
{
  watch: "src/**/*.server.ts",
  output: ".space/types.ts",
  generate(files) {
    return files.map(f =>
      `export type { loader } from "${f}"`
    ).join("\n")
  },
}
```

### Multiple Globs

```ts
{
  watch: ["src/**/*.page.ts", "src/**/*.server.ts"],
  output: ".space/routes.ts",
  generate(files) {
    return `export const files = ${JSON.stringify(files.length)}`
  },
}
```

## Deduplication

The plugin skips writing if output content is unchanged. No unnecessary rebuilds.

## Generated Files

Output files go to `.space/` by default. Add `.space` to `.gitignore`:

```
.space/
```

## Path Aliasing

The plugin does NOT inject aliases. Use tsconfig paths instead:

```json
// tsconfig.json
{
	"compilerOptions": {
		"paths": {
			"#space/*": [".space/*"]
		}
	}
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
});
```
