# HTML

Import from `spacefn/pages` or `spacefn/html`.

## `html`

Tagged template that builds markup. Every interpolated value is escaped; arrays are joined; `null`, `undefined` and `false` render nothing.

```ts
import { html } from "spacefn/pages";

html`<p>${userComment}</p>`; // <script> is shown as text
```

Returns an `Html` instance with the rendered markup in `.value` and a
`toString()` method. Interpolated `Raw` and `Html` values are inserted as
already-rendered markup; other values are escaped.

## `raw`

Places markup unchanged. Use only for markup you built yourself.

```ts
import { raw } from "spacefn/pages";
raw("<b>bold</b>");
```

Returns a `Raw` instance. `Html` and `Raw` are exported classes for identifying
the respective return values; prefer the `html` and `raw` helpers when creating
them.

## `escapeHtml`

Escapes `&`, `<`, `>`, `"` and `'`.

## `css`

Tagged template for CSS text. Interpolates values and prevents `</style>` breakout.

```ts
import { css } from "spacefn/pages";
const color = "red";
css`
	.box {
		color: ${color};
	}
`; // ".box { color: red; }"
```

## `minifyHtml`

Opt-in minifier: collapses whitespace between tags and trims. Preserves content inside `<pre>`, `<code>`, `<textarea>`, `<script>` and `<style>`.

```ts
import { html, minifyHtml } from "spacefn/pages";
minifyHtml(
	html`<div>
		<p>hello</p>
	</div>`,
); // "<div><p>hello</p></div>"
```

See [pages](../directory-structure/pages.md) for the page convention.
