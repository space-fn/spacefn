# @spacefn/datastar

Typed helpers for DataStar attributes, fetch expressions, and server-sent event responses.

## Install

```bash
pnpm add @spacefn/datastar @spacefn/html
```

## Attributes

DataStar helpers return attribute objects. Use `h.attrs()` to merge them with your own attributes:

```ts
import { h } from "@spacefn/html";
import { ds } from "@spacefn/datastar";

h.button(
	h.attrs(ds.dataSignal("count", "0"), ds.dataOn("click", "@get('/count')"), ds.dataText("count"), {
		class: "btn btn-primary",
	}),
	"Increment",
);
```

Or import individual helpers:

```ts
import { dataSignal, dataOn, dataText } from "@spacefn/datastar";

h.button(h.attrs(dataSignal("count", "0"), dataOn("click", "$count++"), { class: "btn" }), "Click");
```

### Reactive and DOM helpers

```ts
ds.dataSignals({ count: 0 });
ds.dataSignal("name", "'Ada'");
ds.dataText("$count");
ds.dataBind("value", "$name");
ds.dataComputed("doubled", "$count * 2");
ds.dataShow("$visible");
ds.dataClass("active", "$selected");
ds.dataAttr("disabled", "$loading");
ds.dataRef("input");
ds.dataOn("click", "$count++", "debounce");
ds.dataIndicator("fetching");
ds.dataEffect("$log.push($count)");
ds.dataInit("$count = 1");
```

### HTTP and action expressions

```ts
ds.get("/api/data");
ds.post("/api/save", { contentType: "json" });
ds.put("/api/items/1");
ds.patch("/api/items/1");
ds.del("/api/items/1");
ds.clipboard("Copied");
ds.toast("Saved", { level: "success" });
ds.setAll("count", 0);
ds.toggleAll();
ds.resetAll();
ds.interval("$count++", 1000);
ds.timeout("$visible = false", 2000);
```

Helpers do not execute JavaScript; they only serialize DataStar attributes for the browser.

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
