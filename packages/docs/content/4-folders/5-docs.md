---
title: docs/
icon: book
---

# docs/

Notes on this app, for whoever works on it next: how it fits together, runbooks, decisions. `npm run docs` (`space docs`) shows them in the same reader as these docs, with spacefn's docs beside them, and `npm run dev` serves it at `/__space/docs/`.

```txt
docs/
├── index.md               the home page
├── 1-architecture.md      /architecture.md
├── logo.svg               the reader's logo
└── 2-runbooks/
    ├── index.md           names and orders the group
    ├── 1-deploys.md       /runbooks/deploys.md
    └── 2-incidents.md     /runbooks/incidents.md
```

Every Markdown file is a page and every folder a group in the sidebar. A number before a name orders it and is left out of the URL and the label. Pages can have frontmatter (`title`, `order`, `description`, `icon`), code with file names and tabs, callouts, Mermaid diagrams and HTML. Edit a file and the open page reloads.

Read more in [Writing docs](../7-reference/3-writing-docs.md).
