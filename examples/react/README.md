# react

A [React](https://react.dev) island on a spacefn app (Bun): the pages are server-rendered `html`, and the cart is a React component that runs only in the browser.

```sh
pnpm dev
pnpm test
```

How it fits together:

- **The plugin** is React's own Vite plugin, beside spacefn's in `configs/vite.ts`.
- **The component** is the cart feature's UI, `modules/cart/ui/Cart.tsx`. `modules/cart/cart.ts` holds what the server and the browser share, so it imports nothing server-only.
- **The island**: `modules/cart/ui/cart.island.tsx` declares it with `island("cart", start)` from `spacefn/island`, where `start` is React's one line to put the component in an element. The page renders `CartIsland.render({ products })`: the element, the props as JSON, and the file's script, once however many carts the page has.
- **Only the shop loads React**: `/about` renders no cart, so it gets no script. On the server, the plugin leaves out the file's browser code, so React never runs there.

Rendering the component on the server too isn't supported: an island starts empty, and fills in once its script runs.
