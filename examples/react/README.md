# react

A [React](https://react.dev) island on a spacefn app (Bun): the pages are server-rendered `html`, and the cart is a React component that runs only in the browser.

```sh
pnpm dev
pnpm test
```

How it fits together:

- **The plugin** is React's own Vite plugin, beside spacefn's in `configs/vite.ts`.
- **The shop** is a feature, `modules/shop/`: `shop.ts` gives the page its data, `views.ts` renders it, and the cart is its client component, `modules/shop/ui/Cart.island.tsx`. Its name makes it an island called `Cart`, and its default export is the component. `products.ts` holds what the server and the browser share, so it imports nothing server-only.
- **The island**: codegen writes `.space/islands/Cart.ts`, which starts the component with React in the browser, and `.space/islands.ts`. The page renders `island("Cart", { products })` from `#space/islands.ts`, with the props typed from the component: the element, the props as JSON, and the script, once however many carts the page has.
- **The about page** is a feature of its own, `modules/about/`.
- **Only the shop loads React**: `/about` renders no cart, so it gets no script. The server only imports the component's types, so React never runs there.

Rendering the component on the server too isn't supported: an island starts empty, and fills in once its script runs.
