# @spacefn/vite-plugin

Generic file-based code generation for Vite. It runs generators at build time, watches TypeScript inputs during development, writes only changed output, invalidates SSR modules, and requests a full reload.

## Install

```bash
pnpm add -D @spacefn/vite-plugin vite
```

## Quick start

```ts
import { defineConfig } from "vite";
import { space } from "@spacefn/vite-plugin";

export default defineConfig({
	plugins: [
		...space({
			generators: [
				{
					watch: "src/**/*.ts",
					output: ".space/files.ts",
					generate(files) {
						return `export const files = ${JSON.stringify(files)};`;
					},
				},
			],
		}),
	],
});
```

`space()` returns an array containing the generator plugin and its dev-server watcher middleware. Spread it into `plugins` rather than nesting that array.

## API

```ts
interface Generator {
	watch: string | string[];
	output: string;
	generate(files: string[]): string | Promise<string>;
}

interface SpaceOptions {
	root?: string;
	generators?: Generator[];
}
```

Generators run once during build. During development, changed `.ts`/`.tsx` inputs regenerate affected outputs, invalidate Vite SSR modules, and trigger a full reload. Non-TypeScript inputs are build-time only with the current watcher.

Outputs are relative to the configured root. Add `.space/` to `.gitignore` when using generated files. The plugin does not inject path aliases; configure aliases in Vite/TypeScript yourself.
