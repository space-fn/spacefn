# Import aliases

spacefn projects use path aliases so you never write `../../` chains. They are wired in two places: `tsconfig.json` (for type checking) and `vite.config.ts` (for bundling).

## The aliases

| Alias        | Maps to                     | Example                                      |
| ------------ | --------------------------- | -------------------------------------------- |
| `@space/*`   | `.space/*` (generated code) | `import { queues } from "@space/queues"`     |
| `@app/*`     | `app/*`                     | `import { env } from "@app/env"`             |
| `@modules/*` | `modules/*`                 | `import { billing } from "@modules/billing"` |
| `@utils/*`   | `utils/*`                   | `import { slugify } from "@utils/slugify"`   |
| `@lib/*`     | `lib/*`                     | `import { http } from "@lib/http"`           |

`@space/*` is the one you use most: every generated helper (`@space`, `@space/client`, `@space/queues`, `@space/db/<name>`) comes through it.

## How they are wired

### Type checking (`tsconfig.json`)

Root `tsconfig.json`:

```json
{
	"compilerOptions": {
		"paths": {
			"@space/*": ["./.space/*"],
			"@app/*": ["./app/*"],
			"@modules/*": ["./modules/*"],
			"@utils/*": ["./utils/*"],
			"@lib/*": ["./lib/*"]
		}
	}
}
```

`app/client/tsconfig.json` (the client bundle) uses paths relative to `app/client/`:

```json
{
	"compilerOptions": {
		"paths": {
			"@space/*": ["../../.space/*"],
			"@app/*": ["../*"],
			"@modules/*": ["../../modules/*"],
			"@utils/*": ["../../utils/*"],
			"@lib/*": ["../../lib/*"]
		}
	}
}
```

### Bundling (`vite.config.ts`)

```ts
import { resolve } from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			"@space": resolve(process.cwd(), ".space"),
			"@app": resolve(process.cwd(), "app"),
			"@modules": resolve(process.cwd(), "modules"),
			"@utils": resolve(process.cwd(), "utils"),
			"@lib": resolve(process.cwd(), "lib"),
		},
	},
	plugins: [space()],
});
```

The `space()` plugin does not inject aliases. It only regenerates `.space/` and merges the Cloudflare config. The alias map is yours to keep in both files.

The client build inherits the root alias map through `runClientBuild`, so you do not need a separate alias list for `app/client/`.

## Adding a new alias

Add it in both places, for the root and the client:

1. Root `tsconfig.json` `paths`: `"@foo/*": ["./foo/*"]`.
2. Root `vite.config.ts` `resolve.alias`: `"@foo": resolve(process.cwd(), "foo")`.
3. Client `app/client/tsconfig.json` `paths`: `"@foo/*": ["../../foo/*"]` (adjust the depth if the folder is nested differently).
4. Create the folder at the project root.

The client bundle picks up the Vite alias from the root config automatically.

## Notes

- `@space/*` depends on `.space/` existing. Run `space gen` (or start dev) before type-checking a fresh clone.
- `space check` verifies that `tsconfig.json` declares `@space/*`. If it is missing, type checking fails with "Cannot find module '@space/...'".
- Relative imports still work. Aliases are a convenience, not a requirement.
