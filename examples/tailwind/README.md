# tailwind

[Tailwind CSS](https://tailwindcss.com) v4 on a spacefn app (Bun): a team directory with a live search.

```sh
pnpm dev
pnpm test
pnpm build
```

What it shows:

- **The plugin** is Tailwind's own, beside spacefn's in `configs/vite.ts`. Tailwind finds the classes in every file that isn't gitignored, so `app/`, `modules/` and `lib/` all count, and `.space/` doesn't.
- **Design tokens** are Tailwind's `@theme` in `lib/ui/theme.css`: `--color-brand-600` gives `bg-brand-600`, `text-brand-600`, ... `app/client/site.css` is the entry that imports it, loaded with `assets("site")`.
- **Components** in `lib/ui/components.ts` (`card`, `badge`) are html functions with the classes written out in full, so Tailwind sees them. Features use them in their views, like `modules/team/views.ts`.
- **Live search** with Datastar: the input binds `$team.query` and `@get`s the page's `search` action as you type, which answers with the list to swap in.
