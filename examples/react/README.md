# react

A [React](https://react.dev) island on a spacefn app (Bun): the pages are server-rendered `html`, and the cart is a React component that runs only in the browser.

```sh
pnpm dev
pnpm test
```

How it fits together:

- **The plugin** is React's own Vite plugin, beside spacefn's in `configs/vite.ts`.
- **The component** is the cart feature's client code, `modules/cart/client/Cart.tsx`, with `mount.tsx` to start it. `modules/cart/cart.ts` holds what the server and the browser share, so it imports nothing server-only.
- **The island**: the page renders `island("cart", { products })` from `lib/ui/island.ts`, an element with the props as JSON. In the browser, `mountIsland` from `lib/ui/mount.ts` reads them and starts the component there.
- **The entry**: `app/client/cart.tsx` only calls `mountCart()`. The shop page loads it with `assets("cart")`, and `/about` doesn't, so pages without the cart don't download React.

Rendering the component on the server too isn't supported: an island starts empty, and fills in once its script runs.
