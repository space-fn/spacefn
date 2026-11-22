# svelte

A [Svelte](https://svelte.dev) island on a spacefn app (Cloudflare): the pages are server-rendered `html`, and the cart is a Svelte component that runs only in the browser.

```sh
pnpm dev
pnpm test
```

How it fits together:

- **The plugin** is Svelte's own Vite plugin, beside spacefn's in `configs/vite.ts`.
- **The component** is the cart feature's UI, `modules/cart/ui/Cart.island.svelte`. Its name makes it an island called `Cart`, and its default export is the component. `modules/cart/cart.ts` holds what the server and the browser share, so it imports nothing server-only.
- **The island**: codegen writes `.space/islands/Cart.ts`, which starts the component with Svelte in the browser, and `.space/islands.ts`. The page renders `island("Cart", { products })` from `#space/islands.ts`, with the props typed from the component when `svelte-check` checks it (plain `tsc` takes any props): the element, the props as JSON, and the script, once however many carts the page has.
- **Only the shop loads Svelte**: `/about` renders no cart, so it gets no script. The server only imports the component's types, so Svelte never runs there.

Rendering the component on the server too isn't supported: an island starts empty, and fills in once its script runs.
