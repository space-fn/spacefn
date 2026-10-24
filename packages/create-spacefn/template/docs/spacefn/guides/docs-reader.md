# Docs reader

In dev mode, visit `http://localhost:5173/__space_docs` to browse the project's
`docs/` folder rendered as HTML. The whole `docs/` tree is served, including
`docs/spacefn/`.

Markdown is rendered with `marked` when installed, and code blocks are
highlighted with `shiki` when installed. Both are optional peer dependencies.
Supported versions: `marked` >=9, `shiki` >=1.

A directory containing `README.md` or `index.md` renders that file instead of a
listing. The reader is dev-only and is not included in production builds.

Files that cannot be read as UTF-8 are returned with a 415 status. Path
traversal outside `docs/` is rejected with 403.
