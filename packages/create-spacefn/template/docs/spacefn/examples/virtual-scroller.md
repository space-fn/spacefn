# Virtual scroller

For long lists, a virtual scroller keeps only a small window of rows in the
DOM and fetches more as the user moves through the list. Datastar's official
[Rocket virtual scroll example](https://data-star.dev/examples/rocket_virtual_scroll)
includes the reusable component, its server-backed blocks, and a working
demonstration.

Use the official example when you need that behavior rather than writing a
virtualizer from scratch:

1. Put the Rocket component and its TypeScript declarations in
   `app/client/`, as described in the [Rocket guide](../guides/datastar-components.md).
2. Include its entry with `script("components.ts")` from the page.
3. Implement its data endpoint in a route or page action, applying the
   same authentication and authorization as any other data endpoint.
4. Keep row rendering escaped with `html`; never interpolate untrusted row
   values into `raw()` markup.

The upstream sample uses a `<virtual-scroll>` custom element configured with
an item endpoint, initial index, and buffer size. Read the upstream page for
its current element props and response contract because the Rocket component
is versioned independently from spacefn.

For ordinary lists, use Datastar fragments and paging before adding
virtualization. Virtual scrolling adds extra client and server state and is
most useful when the list is genuinely large.

See [client bundles](../directory-structure/client.md),
[Datastar components](../guides/datastar-components.md), and the upstream
[virtual scroll example](https://data-star.dev/examples/rocket_virtual_scroll).
