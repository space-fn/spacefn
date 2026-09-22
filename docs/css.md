# @space/css

Functional server render css library.

> NOTE: every API must be explicit for clear understanding

Example:

```ts
import { sx, getCSS } from "@space/css"

// defining UI tokens
// this will generate to css variables at :root
export const tkn = sx.tokens((t) => ({
  colors: {
    gray: {
      50: sx.hex(),
      100: sx.hex(),
      ...
    },
    green: {
      50: sx.rgba(),
      100: sx.rgba(),
      ...
    },
    primary: t.colors.green,
  },
  spacing: {
    md: '1rem',
    ...
  }
}))


// defining UI styles
export const cardSx = sx.css
  .id("card")
  .variants({})
  .defaults({})
  .style((v) => ({
    base: {},
    heading: {},
    footer: {},
  }))
  .compounds(
    [
      {},
      (v) => ({ heading: {} })
    ],
  )

export const buttonSx = sx.css...


export const css = getCSS({
  tokens: tkn,
  styles: [cardSx, buttonSx]
})
```

### Usage with html

```ts
import { renderComponent, defineComponent, h } from "@space/html"
import { cardSx, css } from "./styles"

const page = defineComponent(() => {
  return h.html(
    {},
    h.head(
      {},
      h.style({}, css)
    ),
    h.body(
      {},
      card(),
    )
  )
})

const card = defineComponent(() => {
  return h.div(
    { class: cardSx.base },
    ...
  )
})
```
