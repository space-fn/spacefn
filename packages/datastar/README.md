# @spacefn/datastar

Typed DataStar client attributes and server-side SSE helpers.

## Install

```bash
pnpm add @spacefn/datastar @spacefn/html
```

## Client attributes

Use the `ds` namespace or named exports. Helpers return ordinary attribute objects for `@spacefn/html`:

```ts
import { ds } from "@spacefn/datastar";
import { h, render } from "@spacefn/html";

const html = render(
	h.div(
		ds.dataSignals({ count: 0 }),
		h.button(ds.dataOn("click", ds.get("/count")), "Count: ", h.span(ds.dataText("$count"), "0")),
	),
);
```

### Reactive and DOM helpers

```ts
import { ds } from "@spacefn/datastar";

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

Control-flow helpers are `dataIgnore`, `dataIgnoreSelf`, and `dataIgnoreMorph`. All client helpers are also exported by name for tree-shaking.

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

## Server SSE

Import server helpers from the server subpath:

```ts
import { datastarSSE, readSignals } from "@spacefn/datastar/server";

export async function POST(request: Request) {
	const signals = await readSignals<{ count: number }>(request);
	const sse = datastarSSE();
	sse.patchSignals({ count: signals.count + 1 });
	sse.patchElements('<span id="count">1</span>');
	return sse.toResponse();
}
```

`datastarSSE()` buffers events until `toResponse()`. `datastarSSEStream()` exposes the streaming variant. Both support `patchElements`, `patchSignals`, `removeElements`, `removeSignals`, and `executeScript`.

`readSignals` reads query/body signals according to the request method. Treat patch HTML and scripts as trusted input; escape dynamic content with `@spacefn/html` before embedding it.
