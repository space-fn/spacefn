---
title: package.json
icon: package
---

# package.json

The app's name, scripts, dependencies, and the `#` imports that every tool reads.

```json [package.json]
{
	"name": "my-app",
	"private": true,
	"type": "module",
	"imports": {
		"#configs/*": "./configs/*",
		"#lib/*": "./lib/*",
		"#modules/*": "./modules/*",
		"#space/*": "./.space/*"
	},
	"scripts": {
		"postinstall": "space gen",
		"dev": "space dev",
		"build": "space build",
		"deploy": "space deploy",
		"docs": "space docs",
		"test": "vitest run --config configs/vitest.ts",
		"typecheck": "tsc --noEmit"
	}
}
```

- **`name`** names the Worker, the container and the deploy's resources.
- **`imports`** are Node's [subpath imports](https://nodejs.org/api/packages.html#subpath-imports): Node, TypeScript, Vite, Vitest and Bun all read them, so nothing else needs configuring. Add one for a folder of your own, such as `"#ui/*": "./src/ui/*"`.
- **`postinstall`** runs `space gen`, so `.space/` exists after `npm install`, in CI too.

The dependencies are `spacefn` and `effect`; the dev dependencies Vite, Vitest, TypeScript, Alchemy and its provider for the target, and `spacefn-docs`, which holds these docs and the examples, for you and your agents to read in `node_modules/spacefn-docs/`. `space upgrade` updates spacefn, its provider and the docs together.
