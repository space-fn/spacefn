# lightningcss

Plain CSS through [Lightning CSS](https://lightningcss.dev) on a spacefn app (Bun): write today's CSS, and the build lowers it for the browsers you target.

```sh
pnpm dev
pnpm test
pnpm build
```

What it shows:

- **The config** is Vite's own, in `configs/vite.ts`: `css.transformer: "lightningcss"` with `targets`, and `drafts.customMedia`. No PostCSS, no plugin.
- **Tokens and breakpoints** in `lib/ui/tokens.css`: colors with `light-dark()`, and `@custom-media --narrow`, which every stylesheet can use because Lightning CSS bundles the `@import`s first.
- **Feature styles** next to the feature, `modules/releases/releases.css`, with nested rules. `app/assets/site.css` is only the entry that imports them, loaded with `assets("site")`.
