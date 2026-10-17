# @spacefn/css

Functional server-rendered CSS with tokens, deterministic classes, variants, and transitions.

```ts
import { getCSS, sx } from "@spacefn/css";

export const card = sx.css.id("card").style(() => ({ base: { padding: "1rem" } }));

export const stylesheet = getCSS({ styles: [card] });
```

Use `card.base` with `@spacefn/html` and put `stylesheet` in a `<style>` element. See the [CSS guide](../../docs/css.md).
