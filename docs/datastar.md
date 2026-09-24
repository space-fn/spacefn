# @spacefn/datastar

Typed helpers for DataStar attributes, fetch expressions, and server-sent event responses.

## Install

```bash
pnpm add @spacefn/datastar
```

## Attributes

The `data-*` helpers return ordinary attribute objects, so they compose with `@spacefn/html`:

```ts
import { h } from "@spacefn/html";
import { dataOn, dataText, dataSignal } from "@spacefn/datastar";

h.button(
	{
		...dataSignal("count", "0"),
		...dataOn("click", "@get('/count')"),
		...dataText("count"),
	},
	"Increment",
);
```

Use the exported option types for modifiers, fetch options, patch options, and signal options. Helpers do not execute JavaScript; they only serialize DataStar attributes for the browser.

## Server-sent events

```ts
import { patchElements, patchSignals } from "@spacefn/datastar";

export async function GET() {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(patchElements("#status", "<p>Ready</p>"));
			controller.enqueue(patchSignals({ count: 1 }));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
		},
	});
}
```

`patchElements`, `patchSignals`, `removeElements`, `removeSignals`, `executeScript`, and `autoResponse` build protocol payloads. Keep element HTML trusted or escape it with `@spacefn/html` before sending it.
