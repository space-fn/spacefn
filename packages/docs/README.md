# spacefn-docs

spacefn's docs, and the reader that shows them next to your app's own `docs/` folder. New apps have it as a dev dependency, at the version of their `spacefn`:

```sh
npm run docs        # space docs: http://localhost:4321/
npm run dev         # also serves the reader at /__space/docs/
```

The reader renders Markdown with Shiki, `<code-group>` tabs, GitHub alerts, Mermaid diagrams and raw HTML, and reloads the page when a file changes. See `content/writing-docs.md`.

Coding agents can read the docs as Markdown in `node_modules/spacefn-docs/content/`.

## License

Apache-2.0
