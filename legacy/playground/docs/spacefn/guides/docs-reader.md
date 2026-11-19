# Docs reader

In dev mode, open the URL printed by Vite with `/__space_docs` appended to browse the project's
`docs/` folder rendered as HTML. The whole `docs/` tree is served, including
`docs/spacefn/`.

Markdown is rendered with `marked` when installed, and code blocks are
highlighted with `shiki` when installed. Both are optional peer dependencies.
Supported versions: `marked` >=9, `shiki` >=1.
Raw HTML in Markdown is escaped before it is sent to the browser.

A directory containing `README.md` or `index.md` renders that file instead of a
listing. The reader is dev-only and is not included in production builds.

Files that cannot be read as UTF-8 are returned with a 415 status. Path
traversal outside `docs/` is rejected with 403.

## Layout

- **Sidebar.** The sidebar mirrors `docs/`: every Markdown file and folder you add
  shows up. Each top-level folder is a nav group, and deeper folders fold open.
  Folders are named by their `index.md` or `README.md` title, and pages by their
  first `#` heading. Files sort by name, so a numeric prefix sets the order:
  `1.getting-started/` is shown as "Getting started".
- **Home.** `/__space_docs/` renders `docs/README.md` or `docs/index.md`, or lists
  the folders and files in `docs/` when neither exists.
- **On this page.** `##` and `###` headings get anchor links and are listed on the right.
- **Search.** Press `⌘K`, `Ctrl+K` or `/` to search page titles and `##` headings.
- **Previous and next.** Each page links to its neighbours in sidebar order.
- **Edit this page.** Opens the Markdown file in your editor through Vite.
- **Theme.** Follows the system setting until you pick light or dark in the header.

A `logo.svg`, `logo.png`, `logo.webp` or `logo.jpg` in `docs/` or the app root
is shown in the header. Images inside `docs/`
are served as files, so Markdown can embed them with relative paths.

GitHub-style alerts render as callouts:

```md
> [!TIP]
> Run `vp check` before you commit.
```

`NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION` are supported.
